import type { EditorElementNode } from "@chulane/rivto";
import type { CanvasElement } from "@chulane/rivto-edgeless";
import { type CanvasApi, CanvasSource } from "@chulane/rivto-edgeless";
import { CanvasViewport } from "@chulane/rivto-edgeless/browser";
import { flushSync } from "react-dom";
import type { ReactPanelApi } from "../../panels/types";
import { ElementGeometry } from "../../elements/element-geometry";
import {
  blockIdsOf,
  blockElementRoot,
  EDGELESS_BLOCK_ELEMENT_TYPE,
} from "../../elements/block-element-projection";

/** Shared document notifications and element definitions borrowed by the projection. */
export interface EdgelessCanvasSourceEditor extends Pick<ReactPanelApi["editor"], "subscribe"> {
  readonly elementTypes: Pick<ReactPanelApi["editor"]["elementTypes"], "get" | "subscribe">;
}

/** Borrowed document reads and subscriptions needed by the canvas projection. */
export interface EdgelessCanvasSourcePanel {
  readonly blocks: Pick<ReactPanelApi["blocks"], "getRootIds" | "getParentId">;
  readonly elements: Pick<ReactPanelApi["elements"], "getElementNode" | "getElementNodes">;
  readonly selection: Pick<ReactPanelApi["selection"], "get" | "subscribe">;
  readonly editor: EdgelessCanvasSourceEditor;
}

/** Projects one Rivto occurrence into an independent, surface-owned canvas. */
export class EdgelessCanvasAdapter extends CanvasSource {
  private static readonly adapters = new WeakMap<CanvasApi, EdgelessCanvasAdapter>();
  private connectedCanvas?: CanvasApi;
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
    const rendered = new Set(
      elements
        .filter(
          (element) =>
            element.type !== "group" &&
            (element.type !== EDGELESS_BLOCK_ELEMENT_TYPE ||
              blockElementRoot(element, this.panel.blocks) === null),
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
    if (this.connectedCanvas) {
      throw new Error("Rivto canvas source is already connected");
    }
    this.connectedCanvas = canvas;
    EdgelessCanvasAdapter.adapters.set(canvas, this);
    const releases: (() => void)[] = [];
    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      const errors: unknown[] = [];
      for (const stop of [...releases.reverse(), () => this.releaseSelection?.()]) {
        try {
          stop();
        } catch (error) {
          errors.push(error);
        }
      }
      this.releaseSelection = undefined;
      this.pinnedCardIdsKey = "";
      EdgelessCanvasAdapter.adapters.delete(canvas);
      this.connectedCanvas = undefined;
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
   * @param ids - Block IDs whose DOM is required immediately.
   * @returns Cards are mounted until selection/focus pins take over on the next frame.
   */
  mountBlocks(ids: readonly string[]): void {
    const cards = this.getCardIdsForBlocks(ids);
    if (cards.every((id) => this.canvas.visible.get().includes(id))) {
      return;
    }
    let release: (() => void) | undefined;
    flushSync(() => {
      release = this.canvas.pin(cards);
    });
    requestAnimationFrame(() => release?.());
  }

  /**
   * Mounts virtualized Rivto cards for a DOM selection or focus request.
   * @param root - Active surface root; page surfaces are ignored.
   * @param ids - Blocks that need live DOM hosts.
   * @returns Matching cards are synchronously mounted when a canvas adapter exists.
   */
  static mountBlocksForElement(root: HTMLElement, ids: readonly string[]): void {
    const canvas = CanvasViewport.forElement(root)?.canvas;
    if (canvas) {
      EdgelessCanvasAdapter.adapters.get(canvas)?.mountBlocks(ids);
    }
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
