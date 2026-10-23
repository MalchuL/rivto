import { BlockDropFeedback } from "./block-drop-feedback";
import { BlockDragSourceFeedback } from "./block-drag-source-feedback";
import { BLOCK_EDITOR_CLASSES } from "../../presentation/block-editor-classes";
import { BlockAutoScroll } from "../pointer/block-auto-scroll";
import type { BlockInputResult } from "../events/block-input-event";
import type { BlockEditorApi } from "../block-editor-api";
import type { BlockEditorBlocks, BlockEditorSelection } from "../../adapter/types";
import type { BlockEditorExtension } from "../extensions/types";
import type { BlockInputEvent } from "../events/block-input-event";
import type { BlockEditorEventsApi } from "../events/block-editor-events";
import { BlockSelectionRanges } from "../selection/block-selection-ranges";
import type { BlockDropDestination, BlockDragTargetScope, ResolvedBlockDropTarget } from "./types";

/** Handle dragging claims input before ordinary selection and keyboard commands. */
const BLOCK_DRAG_INPUT_PRIORITY = 1000;

/** Detached read-only preview text supplied by the host, without editable renderers or subtrees. */
export interface BlockDragPreviewRow {
  readonly text: string;
  /** Relative outline depth within a captured root; zero denotes that root. */
  readonly depth: number;
}

/** Host-owned transactional move; Page never writes hierarchy directly. */
export interface BlockDragAdapter {
  /**
   * Captures a bounded text preview once when a pointer gesture activates.
   *
   * Read only the requested prefix of visible addressed nodes; do not materialize
   * recursive snapshots or count omitted descendants. Omission keeps count-only feedback.
   *
   * @param ids - Captured source roots, including roots outside the mounted viewport.
   * @param limit - Positive maximum number of node reads and returned rows, currently four.
   * @returns Detached text rows in visible order; empty means no content preview.
   * @throws Host read failures cancel the gesture and propagate through event delivery.
   */
  getPreview?(ids: readonly string[], limit: number): readonly BlockDragPreviewRow[];

  /**
   * Checks current host constraints without mutating data or selection.
   *
   * Feedback uses this check for each resolved target. Commit must validate again
   * because permissions, sources and hierarchy may change during a gesture.
   *
   * @param ids - Captured roots, including selected blocks outside the viewport.
   * @param destination - Current actual parent and adjacent insertion neighbors.
   * @param scope - Receiving attachment for a foreign occurrence; omitted for local moves.
   * @returns Whether the current host state permits this grouped move.
   * @throws Propagates delegated validation failures.
   */
  canMove(
    ids: readonly string[],
    destination: BlockDropDestination,
    scope?: BlockDragTargetScope,
  ): boolean;

  /**
   * Validates and moves the captured roots together using current document state.
   *
   * Recheck access, source existence, nesting policy, cycles and destination
   * neighbors before writing. Invalid moves return false without partial writes.
   * Preserve subtree identities and publish structural selection in the new order.
   * The host owns transactions, undo and subscriber delivery.
   *
   * @param ids - Unique, canonically ordered roots captured at gesture start.
   * @param destination - Actual parent and optional adjacent insertion neighbors.
   * @param scope - Receiving attachment to revalidate; omitted for the source occurrence.
   * @returns Whether the move was accepted and committed synchronously.
   * @throws Delegated transaction failures; the gesture still releases its resources.
   */
  moveBlocks(
    ids: readonly string[],
    destination: BlockDropDestination,
    scope?: BlockDragTargetScope,
  ): boolean;
}

/** Geometry capability borrowed by a drag gesture; the host selects its layout resolver. */
export interface BlockDragTargets {
  /**
   * Resolves a live destination while excluding captured moving subtrees.
   *
   * @param x - Viewport X coordinate in CSS pixels.
   * @param y - Viewport Y coordinate in CSS pixels.
   * @param excluded - Captured moving roots, including unmounted selection.
   * @param hit - Uncaptured native target from this pointer event, omitted during pointer capture and scroll reconciliation.
   * @returns Current target, or undefined when no eligible region is hit.
   */
  resolve(
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    hit?: Element,
  ): ResolvedBlockDropTarget | undefined;
}

/** Small read boundary used to normalize a captured structural selection. */
interface BlockDragSourceData {
  readonly blocks: Pick<BlockEditorBlocks, "getParentId">;
  readonly selection: Pick<BlockEditorSelection, "get">;
}

/** Selects roots without walking descendants or depending on mounted blocks. */
export class BlockDragSources {
  /**
   * Removes selected descendants while retaining canonical selection order.
   *
   * Partial text selection and an unselected handle drag only the active block.
   * Selected roots with different parents remain one group.
   *
   * @param data - Host selection and actual parent lookup.
   * @param activeId - Identity whose handle started the gesture.
   * @returns Captured unique roots; each parent lookup is independent of the viewport.
   */
  static get(data: BlockDragSourceData, activeId: string): readonly string[] {
    const selection = data.selection.get();
    if (
      !BlockSelectionRanges.isStructuralSelection(selection) ||
      !selection?.blocks.some(({ id }) => id === activeId)
    ) {
      return [activeId];
    }
    const ids = new Set(selection.blocks.map(({ id }) => id));
    return [...ids].filter((id) => {
      let parent = data.blocks.getParentId(id);
      while (parent) {
        if (ids.has(parent)) {
          return false;
        }
        parent = data.blocks.getParentId(parent);
      }
      return true;
    });
  }
}

/** Dependencies borrowed by one installation, excluding registry and editor teardown. */
interface BlockDragHost {
  readonly adapter: BlockDragSourceData;
  readonly pointer: BlockEditorApi["pointer"];
  readonly events: Pick<BlockEditorEventsApi, "register" | "observe" | "onDetach">;
}

/** Pointer state survives source unmount; DOM feedback never renders block subtrees. */
interface BlockDragGesture {
  readonly root: HTMLElement;
  readonly pointerId: number;
  readonly activeId: string;
  readonly startX: number;
  readonly startY: number;
  x: number;
  y: number;
  ids?: readonly string[];
  selected?: ReadonlySet<string>;
  preview?: HTMLElement;
  readonly feedback: BlockDropFeedback;
  readonly sourceFeedback: BlockDragSourceFeedback;
  stopTargetDetach?: () => void;
  target?: ResolvedBlockDropTarget;
  readonly releasePointer: () => void;
  autoScroll?: BlockAutoScroll;
}

/** Installs optional handle dragging without adding a mandatory controller manager. */
export class BlockDragExtension implements BlockEditorExtension {
  /**
   * Captures the host mutation boundary for each independently owned installation.
   *
   * @param adapter - Host operation; no document or panel backlink is required.
   * @param targets - Optional layout resolver; omission uses explicit editor drop regions.
   * @param activationDistance - CSS pixels before dragging activates; defaults to four.
   */
  constructor(
    private readonly adapter: BlockDragAdapter,
    private readonly targets?: BlockDragTargets,
    private readonly activationDistance = 4,
  ) {}

  /**
   * Creates a gesture runtime and captures its event registrations in extension setup.
   *
   * @param editor - Borrowed editor; native registrations survive view remount.
   * @returns Disposer cancelling active feedback before registered listeners are released.
   */
  setup(editor: BlockEditorApi): () => void {
    const runtime = new BlockDragController(
      editor,
      this.adapter,
      this.targets ?? editor.dropTargets,
      this.activationDistance,
    );
    runtime.install();
    return () => runtime.cancel();
  }
}

/** Owns one handle gesture and cancels it on view loss or extension disposal. */
class BlockDragController {
  private static sequence = 0;
  private gesture: BlockDragGesture | undefined;
  private suppressedClickId: string | undefined;
  private readonly prefix = `block-drag-${++BlockDragController.sequence}`;

  /**
   * Borrows addressed reads, native events, hit testing and host commit only.
   *
   * @param editor - Capabilities used for this installation's lifetime.
   * @param adapter - Validating host mutation operation.
   * @param targets - Borrowed layout hit testing for this installation.
   * @param activationDistance - CSS pixel movement required to activate.
   */
  constructor(
    private readonly editor: BlockDragHost,
    private readonly adapter: BlockDragAdapter,
    private readonly targets: BlockDragTargets,
    private readonly activationDistance: number,
  ) {}

  /**
   * Registers handle input ahead of selection and releases gestures on detach.
   *
   * @returns Synchronous registrations are captured by extension setup.
   */
  install(): void {
    this.editor.events.register(
      `${this.prefix}.click`,
      { type: "click", capture: true, priority: BLOCK_DRAG_INPUT_PRIORITY, scope: "block" },
      this.suppressClick,
    );
    this.editor.events.register(
      `${this.prefix}.down`,
      { type: "pointerdown", priority: BLOCK_DRAG_INPUT_PRIORITY, scope: "block" },
      (event) => this.start(event),
    );
    this.editor.events.register(
      `${this.prefix}.move`,
      { type: "pointermove", target: "window", priority: BLOCK_DRAG_INPUT_PRIORITY },
      (event) => this.move(event.raw),
    );
    this.editor.events.register(
      `${this.prefix}.up`,
      { type: "pointerup", target: "window", priority: BLOCK_DRAG_INPUT_PRIORITY },
      (event) => this.finish(event.raw),
    );
    this.editor.events.observe(
      `${this.prefix}.cancel`,
      { type: "pointercancel", target: "window", priority: BLOCK_DRAG_INPUT_PRIORITY },
      (event) => {
        if (event.raw.pointerId === this.gesture?.pointerId) {
          this.cancel();
        }
      },
    );
    this.editor.events.register(
      `${this.prefix}.escape`,
      { type: "keydown", target: "window", priority: BLOCK_DRAG_INPUT_PRIORITY },
      (event) => {
        if (this.gesture && event.raw.key === "Escape") {
          event.raw.preventDefault();
          this.cancel();
          return "handled";
        }
        return "continue";
      },
    );
    this.editor.events.observe(
      `${this.prefix}.blur`,
      { type: "blur", target: "window", priority: BLOCK_DRAG_INPUT_PRIORITY },
      () => this.cancel(),
    );
    this.editor.events.onDetach(() => this.cancel());
  }

  /**
   * Removes feedback and scheduled work without modifying document or selection.
   *
   * @returns Every gesture resource has been offered cleanup; repeated cancellation is harmless.
   * @throws AggregateError after attempting all cleanup operations if any fail.
   */
  cancel(): void {
    const gesture = this.gesture;
    this.gesture = undefined;
    if (!gesture) {
      return;
    }
    if (gesture.ids) {
      this.suppressedClickId = gesture.activeId;
    }
    const errors: unknown[] = [];
    for (const release of [
      () => gesture.autoScroll?.stop(),
      gesture.releasePointer,
      () => gesture.stopTargetDetach?.(),
      () => gesture.feedback.clear(),
      () => gesture.sourceFeedback.clear(),
      () => gesture.preview?.remove(),
    ]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Block drag cleanup failed");
    }
  }

  /**
   * Cancels a failed gesture without replacing the original delivery failure.
   *
   * @param error - Selection, geometry or permission failure that aborted delivery.
   * @returns Never returns; the original error remains observable.
   * @throws The original error, or AggregateError containing it and cleanup failures.
   */
  private cancelAfterFailure(error: unknown): never {
    try {
      this.cancel();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Block drag failed during cleanup");
    }
    throw error;
  }

  /**
   * Prevents a completed or cancelled drag from activating the handle's click action.
   *
   * @param input - Captured click in the source occurrence.
   * @returns Handled only for the click belonging to the preceding activated drag.
   */
  private suppressClick = (input: BlockInputEvent<"click">): BlockInputResult => {
    if (input.blockId !== this.suppressedClickId) {
      return "continue";
    }
    this.suppressedClickId = undefined;
    input.raw.preventDefault();
    input.raw.stopPropagation();
    return "handled";
  };

  /**
   * Reserves a primary pointer from an explicitly marked handle in this occurrence.
   *
   * @param event - Normalized pointer input with nearest block identity.
   * @returns "handled" when the handle acquires pointer ownership; otherwise "continue".
   */
  private start(event: BlockInputEvent<"pointerdown">): BlockInputResult {
    const target = event.raw.target;
    const ElementType = event.root.ownerDocument.defaultView!.Element;
    if (
      event.raw.button !== 0 ||
      !event.raw.isPrimary ||
      !event.blockId ||
      !event.blockElement ||
      !(target instanceof ElementType) ||
      !target.closest("[data-block-drag-handle]")
    ) {
      return "continue";
    }
    this.cancel();
    this.suppressedClickId = undefined;
    const releasePointer = this.editor.pointer.acquire();
    if (!releasePointer) {
      return "continue";
    }
    event.raw.preventDefault();
    this.gesture = {
      releasePointer,
      root: event.root,
      feedback: new BlockDropFeedback(event.root),
      sourceFeedback: new BlockDragSourceFeedback(event.root, event.blockElement),
      pointerId: event.raw.pointerId,
      activeId: event.blockId,
      startX: event.raw.clientX,
      startY: event.raw.clientY,
      x: event.raw.clientX,
      y: event.raw.clientY,
    };
    return "handled";
  }

  /**
   * Activates after four CSS pixels and updates only bounded DOM feedback.
   *
   * Losing the primary button cancels a gesture even if release happened outside
   * the browser viewport and no pointerup reached this occurrence's window.
   *
   * @param event - Window pointer event; unrelated pointers are ignored.
   * @returns "handled" for movement of the active pointer; otherwise "continue".
   * @throws Activation or target failures after cancellation; cleanup failures are aggregated.
   */
  private move(event: PointerEvent): BlockInputResult {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return "continue";
    }
    if ((event.buttons & 1) === 0) {
      this.cancel();
      return "handled";
    }
    try {
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      if (!gesture.ids) {
        if (
          Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) <
          this.activationDistance
        ) {
          return "handled";
        }
        gesture.ids = BlockDragSources.get(this.editor.adapter, gesture.activeId);
        gesture.selected = new Set(gesture.ids);
      }
      event.preventDefault();
      const hit = this.uncapturedHit(event, gesture.root);
      // Scroll preflight reads styles and geometry before feedback changes the DOM.
      this.schedule(gesture, hit);
      this.resolve(gesture, hit);
    } catch (error) {
      this.cancelAfterFailure(error);
    }
    return "handled";
  }

  /**
   * Re-resolves the release point and delegates one validating host transaction.
   *
   * @param event - Release for the active pointer.
   * @returns "handled" for release of a pending or active gesture; otherwise "continue".
   * @throws Host failures propagate after attempting every cleanup and focus restoration;
   * concurrent failures are reported together in an AggregateError.
   */
  private finish(event: PointerEvent): BlockInputResult {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return "continue";
    }
    const errors: unknown[] = [];
    let focusRoot = gesture.root;
    try {
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      if (gesture.ids) {
        this.resolve(gesture, this.uncapturedHit(event, gesture.root));
        if (gesture.target) {
          const target = gesture.target;
          if (this.adapter.moveBlocks(gesture.ids, target.destination, target.scope)) {
            focusRoot = target.scope?.root ?? gesture.root;
          }
        }
      }
    } catch (error) {
      errors.push(error);
    }
    try {
      this.cancel();
    } catch (error) {
      errors.push(error);
    }
    try {
      if (gesture.ids && focusRoot.isConnected) {
        focusRoot.focus({ preventScroll: true });
      }
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Block drag completion failed");
    }
    return "handled";
  }

  /**
   * Borrows this native event's target unless pointer capture redirected delivery.
   *
   * The result is consumed synchronously; scroll reconciliation still hit-tests
   * geometry afresh and no hit survives into another input event.
   *
   * @param event - Current pointer move or release event.
   * @param root - Gesture attachment supplying the correct DOM realm.
   * @returns Connected uncaptured element, or undefined to request geometric resolution.
   */
  private uncapturedHit(event: PointerEvent, root: HTMLElement): Element | undefined {
    const ElementType = root.ownerDocument.defaultView!.Element;
    if (
      event.target instanceof ElementType &&
      event.target.isConnected &&
      !event.target.hasPointerCapture?.(event.pointerId)
    ) {
      return event.target;
    }
    return undefined;
  }

  /**
   * Resolves mounted targets and rejects a parent inside a captured source subtree.
   *
   * @param gesture - Active captured roots and latest viewport coordinates.
   * @param hit - Current uncaptured native pointer target; omitted when geometry must be re-read.
   * @returns Target highlight and count preview reflect the current permitted hit.
   * @throws Target or permission failures propagate after gesture resources are released.
   */
  private resolve(gesture: BlockDragGesture, hit?: Element): void {
    try {
      let target = this.targets.resolve(gesture.x, gesture.y, gesture.selected ?? new Set(), hit);
      if (
        target?.scope &&
        (!target.scope.root.isConnected ||
          target.scope.root.ownerDocument !== gesture.root.ownerDocument ||
          !target.scope.root.contains(target.element))
      ) {
        target = undefined;
      }
      let parent: string | null | undefined = target?.scope
        ? undefined
        : target?.destination.parentId;
      while (parent) {
        if (gesture.selected?.has(parent)) {
          target = undefined;
          break;
        }
        parent = this.editor.adapter.blocks.getParentId(parent);
      }
      if (
        target &&
        gesture.ids &&
        !this.adapter.canMove(gesture.ids, target.destination, target.scope)
      ) {
        target = undefined;
      }
      if (gesture.target?.scope !== target?.scope) {
        gesture.stopTargetDetach?.();
        gesture.stopTargetDetach = target?.scope?.onDetach(() => this.cancel());
        if (this.gesture !== gesture) {
          gesture.stopTargetDetach?.();
          return;
        }
      }
      gesture.target = target;
      gesture.feedback.update(target);
      // Resolve native geometry before inserting feedback: adding the preview can
      // invalidate hit-test data for the whole mounted document.
      if (!gesture.preview && gesture.ids) {
        gesture.sourceFeedback.show(gesture.ids);
        this.createPreview(gesture, gesture.ids);
      }
      if (gesture.preview) {
        gesture.preview.style.transform = `translate(${gesture.x + 12}px, ${gesture.y + 12}px)`;
      }
    } catch (error) {
      this.cancelAfterFailure(error);
    }
  }

  /**
   * Creates non-interactive text feedback once, after target geometry has been read.
   *
   * The host bounds model reads. Page independently caps DOM rows, displayed text
   * and indentation; native textContent keeps markup inert. Movement changes only
   * the outer transform and never asks the host for another snapshot.
   *
   * @param gesture - Owner responsible for removing the preview on every exit path.
   * @param ids - Captured canonical source roots used for the group count.
   * @returns At most four content rows and the source-root count are mounted.
   * @throws Host preview reads or DOM creation failures propagate to gesture cleanup.
   */
  private createPreview(gesture: BlockDragGesture, ids: readonly string[]): void {
    const rows = this.adapter.getPreview?.(ids, 4) ?? [];
    const document = gesture.root.ownerDocument;
    const preview = document.createElement("div");
    gesture.preview = preview;
    preview.className = "rivto-block-drag-preview";
    preview.textContent = `${ids.length} blocks`;
    for (const row of rows.slice(0, 4)) {
      const content = document.createElement("div");
      content.className = BLOCK_EDITOR_CLASSES.dragPreviewRow;
      content.textContent = row.text.slice(0, 240);
      content.style.marginInlineStart = `${Math.max(0, Math.min(3, row.depth)) * 12}px`;
      preview.append(content);
    }
    gesture.root.append(preview);
  }

  /**
   * Scrolls nested containers and the window near their edges, then resolves moved targets.
   *
   * @param gesture - Current gesture; cancellation prevents further scheduling.
   * @param hit - Current uncaptured native target, used only to skip unnecessary scroll frames.
   * @returns At most one scroll frame is pending; no selected subtree is traversed per frame.
   */
  private schedule(gesture: BlockDragGesture, hit?: Element): void {
    if (!gesture.autoScroll) {
      gesture.autoScroll = new BlockAutoScroll(gesture.root, () => this.resolve(gesture));
    }
    gesture.autoScroll.update(gesture, hit);
  }
}
