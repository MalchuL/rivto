import type { EditorElementNode } from "@chulane/rivto";
import type { FrameClock, InputRoot } from "@chulane/rivto-root";
import type { CanvasElement } from "@chulane/rivto-edgeless";
import { type CanvasApi, CanvasSource } from "@chulane/rivto-edgeless";
import { flushSync } from "react-dom";
import type { EdgelessCanvasSourcePanel } from "./types";
import { ElementGeometry } from "../../elements/element-geometry";
import {
  blockIdsOf,
  blockElementRoot,
  EDGELESS_BLOCK_ELEMENT_TYPE,
} from "../../elements/block-element-projection";

/** Projects one Rivto occurrence into an independent, surface-owned canvas. */
export class EdgelessCanvasAdapter extends CanvasSource {
  private connectedCanvas?: CanvasApi;
  private disconnecting = false;
  private readonly pendingMounts = new Set<() => void>();
  private readonly geometry: ElementGeometry;
  private releaseSelection?: () => void;
  private pinnedCardIdsKey = "";

  /**
   * Creates a projection without subscribing to external sources.
   * @param panel - Fixed document occurrence supplying elements and selection.
   */
  constructor(private readonly panel: EdgelessCanvasSourcePanel) {
    super();
    this.geometry = new ElementGeometry((id) => panel.elements.getElementNode(id));
  }

  /**
   * Reads detached geometry and registered capabilities without subscriptions or DOM access.
   *
   * Hidden block cards retain geometry but are excluded from geometry selection
   * queries. Groups participate in those queries only when they contain a rendered
   * descendant, so a retained subtree panel cannot create an invisible selection
   * target in the document.
   *
   * @returns Full source projection, including offscreen objects and group geometry.
   */
  override getElements(): readonly CanvasElement[] {
    const elements = this.panel.elements.getElementNodes();
    const parents = this.blockParents(elements);
    const rendered = new Set(
      elements
        .filter(
          (element) =>
            element.type !== "group" &&
            (element.type !== EDGELESS_BLOCK_ELEMENT_TYPE ||
              this.blockParent(element, parents) === null),
        )
        .map(({ id }) => id),
    );
    const selectable = this.getSelectableIds(elements, rendered);
    return elements.map((element) => {
      const behavior = this.panel.editor.elementTypes.get(element.type)?.behavior;
      const absolute = behavior?.absoluteGeometry;
      return {
        id: element.id,
        frame: this.geometry.frame(element.id) ?? element.frame,
        rotation: absolute ? 0 : this.geometry.rotation(element.id),
        zIndex: element.zIndex,
        bounds: this.geometry.bounds(element.id),
        render: rendered.has(element.id),
        selectable: selectable.has(element.id),
        movable: !absolute,
        resizable: !absolute,
        rotatable: !absolute,
        minSize:
          element.type === EDGELESS_BLOCK_ELEMENT_TYPE ? ([180, 100] as const) : ([1, 1] as const),
      };
    });
  }

  /**
   * Observes source geometry and occurrence-local selection for this mounted surface.
   * @param canvas - Receiving scene owned by the edgeless editor.
   * @returns Cleanup releasing subscriptions and source-owned pins.
   * @throws If already connected, or source initialization fails.
   */
  override connect(canvas: CanvasApi): () => void {
    if (this.connectedCanvas || this.disconnecting) {
      throw new Error("Rivto canvas source is already connected");
    }
    this.connectedCanvas = canvas;
    const releases: (() => void)[] = [];
    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      this.disconnecting = true;
      this.connectedCanvas = undefined;
      const releaseSelection = this.releaseSelection;
      this.releaseSelection = undefined;
      this.pinnedCardIdsKey = "";
      const errors: unknown[] = [];
      for (const stop of [
        ...releases.reverse(),
        ...this.pendingMounts,
        () => releaseSelection?.(),
      ]) {
        try {
          stop();
        } catch (error) {
          errors.push(error);
        }
      }
      this.disconnecting = false;
      if (errors.length) {
        throw new AggregateError(errors, "Rivto canvas source cleanup failed");
      }
    };
    try {
      this.refresh();
      releases.push(this.panel.editor.subscribe(() => this.refresh()));
      releases.push(this.panel.editor.elementTypes.subscribe(() => this.refresh()));
      releases.push(this.panel.selection.subscribe(() => this.refreshSelection()));
    } catch (error) {
      try {
        release();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Rivto canvas source connection failed");
      }
      throw error;
    }
    return release;
  }

  /**
   * Resolves document block IDs to their owning projected canvas cards.
   * @param ids - Any nested or root block IDs in this occurrence.
   * @returns Unique card IDs covering those blocks.
   */
  getCardIdsForBlocks(ids: readonly string[]): string[] {
    if (!ids.length) {
      return [];
    }
    const roots = this.panel.blocks.getRootIds();
    const rootIds = new Set(roots);
    const wanted = new Set(
      ids.map((id) => {
        let current = id;
        let parent = this.panel.blocks.getParentId(current);
        while (parent && !rootIds.has(current)) {
          current = parent;
          parent = this.panel.blocks.getParentId(current);
        }
        return current;
      }),
    );
    return this.panel.elements
      .getElementNodes()
      .filter(
        (element) =>
          element.type === EDGELESS_BLOCK_ELEMENT_TYPE &&
          blockIdsOf(element, roots).some((id) => wanted.has(id)),
      )
      .map(({ id }) => id);
  }

  /**
   * Mounts cards synchronously before a programmatic focus or selection operation.
   *
   * Before the source connects, no cards are mounted. After connection, pins last
   * until selection or focus pins take over on the next frame. Surface cleanup
   * releases the navigation registration independently of source disconnection.
   *
   * @param ids - Block IDs whose DOM is required immediately.
   * @param root - Exact mounted occurrence providing the frame clock.
   * @returns Available cards are mounted synchronously while the occurrence is attached.
   * @throws Propagates document reads, scheduling, cleanup and synchronous React commit failures.
   */
  mountBlocks(
    ids: readonly string[],
    root: Pick<InputRoot, "isAttached" | "captureFrameClock">,
  ): void {
    const canvas = this.connectedCanvas;
    if (!canvas || !root.isAttached()) {
      return;
    }
    const clock = root.captureFrameClock();
    if (!clock || !root.isAttached() || this.connectedCanvas !== canvas) {
      return;
    }
    const cards = this.getCardIdsForBlocks(ids);
    if (
      this.connectedCanvas !== canvas ||
      !root.isAttached() ||
      cards.every((id) => canvas.visible.get().includes(id))
    ) {
      return;
    }
    let releasePin: (() => void) | undefined;
    flushSync(() => {
      releasePin = canvas.pin(cards);
    });
    if (!releasePin) {
      return;
    }
    this.releaseMountAfterFrame(root, canvas, clock, releasePin);
  }

  /**
   * Resolves the scene currently receiving this source's document projection.
   *
   * @returns The connected scene.
   * @throws If source operations are attempted outside a connection.
   */
  private get canvas(): CanvasApi {
    if (!this.connectedCanvas) {
      throw new Error("Rivto canvas source is not connected");
    }
    return this.connectedCanvas;
  }

  /**
   * Releases a navigation pin on the originating Root's next frame.
   *
   * Disconnect also invokes the same idempotent cleanup. Reentrant detachment
   * or scheduling failure releases the pin and any returned frame disposer.
   *
   * @param root - Occurrence captured by the navigation request.
   * @param canvas - Scene that owns the temporary pin.
   * @param clock - Frame scheduler captured from the occurrence.
   * @param releasePin - Releases this request's canvas pin.
   * @returns The source retains cleanup until the frame or disconnection.
   * @throws Propagates attachment, scheduling, and cleanup failures.
   */
  private releaseMountAfterFrame(
    root: Pick<InputRoot, "isAttached">,
    canvas: CanvasApi,
    clock: Pick<FrameClock, "requestFrame">,
    releasePin: () => void,
  ): void {
    let cancelFrame: (() => void) | undefined;
    /**
     * Releases this pin and its scheduled frame once, including on disconnection.
     *
     * @returns The frame and pin are released when still pending.
     * @throws If either cleanup fails, after both have been attempted.
     */
    const finish = () => {
      if (!this.pendingMounts.delete(finish)) {
        return;
      }
      const errors: unknown[] = [];
      for (const release of [() => cancelFrame?.(), releasePin]) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Canvas navigation pin cleanup failed");
      }
    };
    this.pendingMounts.add(finish);
    try {
      if (!root.isAttached() || this.connectedCanvas !== canvas) {
        finish();
        return;
      }
      const cancel = clock.requestFrame(() => {
        cancelFrame = undefined;
        finish();
      });
      if (!this.pendingMounts.has(finish)) {
        cancel?.();
      } else if (cancel) {
        cancelFrame = cancel;
      } else {
        finish();
      }
    } catch (error) {
      try {
        finish();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Canvas navigation pin setup failed");
      }
      throw error;
    }
  }

  /**
   * Resolves a card's panel-relative parent using the current batch when available.
   *
   * A surviving start boundary takes precedence; the end is used only when the
   * start is missing. Subtree panels retain their existing scoped lookup.
   *
   * @param element - Block card containing its persisted boundary IDs.
   * @param parents - Current whole-document parent snapshot, or undefined for a subtree panel.
   * @returns Parent ID, null for this panel's roots, or undefined without a surviving boundary.
   */
  private blockParent(
    element: EditorElementNode,
    parents: ReadonlyMap<string, string | null> | undefined,
  ): string | null | undefined {
    if (!parents) {
      return blockElementRoot(element, this.panel.blocks);
    }
    const start = element.props.startBlockId;
    const end = element.props.endBlockId;
    const parent = typeof start === "string" ? parents.get(start) : undefined;
    if (parent !== undefined) {
      return parent;
    }
    return typeof end === "string" ? parents.get(end) : undefined;
  }

  /**
   * Reads document-card boundary parents in batches for a whole-document panel.
   *
   * End boundaries are read only when their start is missing, preserving the
   * existing start-first lookup and its cached-path behavior. Subtree panels use
   * their panel-relative lookup instead.
   *
   * @param elements - Current occurrence's flat element records.
   * @returns Boundary parents, or undefined for a subtree panel.
   * @throws Propagates document hierarchy read failures.
   */
  private blockParents(
    elements: readonly EditorElementNode[],
  ): ReadonlyMap<string, string | null> | undefined {
    if (this.panel.rootBlockId !== undefined) {
      return undefined;
    }
    const cards = elements.filter((element) => element.type === EDGELESS_BLOCK_ELEMENT_TYPE);
    const starts = cards.flatMap((element) => {
      const id = element.props.startBlockId;
      return typeof id === "string" ? [id] : [];
    });
    const parents = new Map(this.panel.document.blocks.getParentIds(starts));
    const ends = cards.flatMap((element) => {
      const start = element.props.startBlockId;
      const end = element.props.endBlockId;
      return (typeof start !== "string" || !parents.has(start)) && typeof end === "string"
        ? [end]
        : [];
    });
    if (ends.length) {
      for (const [id, parent] of this.panel.document.blocks.getParentIds(ends)) {
        parents.set(id, parent);
      }
    }
    return parents;
  }

  /**
   * Refreshes projected geometry without storing document nodes in the canvas.
   * @returns Visibility reflects current document elements and registered capabilities.
   */
  private refresh(): void {
    this.canvas.setElements(this.getElements());
    this.refreshSelection();
  }

  /**
   * Mirrors selection and pins only cards needed for text or structural DOM selection.
   * @returns Object selection remains virtualized while selected document content stays mounted.
   */
  private refreshSelection(): void {
    const selection = this.panel.selection.get();
    this.canvas.setSelection(selection?.elements ?? []);
    const ids = selection?.blocks.map((block) => block.id) ?? [];
    const cards = this.getCardIdsForBlocks(ids);
    const key = cards.join("\0");
    if (key === this.pinnedCardIdsKey) {
      return;
    }
    const previous = this.releaseSelection;
    this.releaseSelection = this.canvas.pin(cards);
    this.pinnedCardIdsKey = key;
    previous?.();
  }

  /**
   * Includes rendered leaves and every group containing at least one rendered leaf.
   *
   * The flat source can arrive in storage order rather than hierarchy order. Each
   * included ancestor is visited once, keeping membership work linear even for
   * nested groups. Geometry and persisted child membership remain unchanged.
   *
   * @param elements - Current occurrence's flat element records, including hidden cards.
   * @param rendered - Leaf IDs admitted by this occurrence's rendering policy.
   * @returns Selectable leaf and group identities; empty for entirely hidden trees.
   */
  private getSelectableIds(
    elements: readonly EditorElementNode[],
    rendered: ReadonlySet<string>,
  ): Set<string> {
    const parents = new Map<string, string>();
    for (const element of elements) {
      if (element.type === "group") {
        for (const childId of element.childIds) {
          parents.set(childId, element.id);
        }
      }
    }
    const selectable = new Set(rendered);
    const pending = [...rendered];
    while (pending.length) {
      const parent = parents.get(pending.pop()!);
      if (parent && !selectable.has(parent)) {
        selectable.add(parent);
        pending.push(parent);
      }
    }
    return selectable;
  }
}
