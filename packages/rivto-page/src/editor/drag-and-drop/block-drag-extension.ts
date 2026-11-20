import { BlockDragSourceFeedback } from "./block-drag-source-feedback";
import { BlockDragBrowser } from "./browser/block-drag-browser";
import type { InputTarget } from "@chulane/rivto-root";
import type { BlockInputResult } from "../events/types";
import type { BlockEditorApi } from "../types";
import type { BlockEditorBlocks, BlockEditorSelection } from "../../adapter/types";
import type { BlockEditorExtension } from "../extensions/types";
import type { BlockInputEvent } from "../events/types";
import type { BlockEditorEventsApi } from "../events/types";
import { BlockSelectionRanges } from "../selection/block-selection-ranges";
import type {
  BlockDragPreviewRow,
  BlockDragReleaseInput,
  BlockDropDestination,
  BlockDragTargetScope,
  BlockDragHit,
  BlockDragTargets,
  ResolvedBlockDropTarget,
  BlockDragGesture,
} from "./types";

/** Handle dragging claims input before ordinary selection and keyboard commands. */
const BLOCK_DRAG_INPUT_PRIORITY = 1000;

export type { BlockDragPreviewRow } from "./types";

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
      `${this.prefix}.down`,
      { type: "pointerdown", priority: BLOCK_DRAG_INPUT_PRIORITY, scope: "block" },
      (event) => this.start(event),
    );
    this.editor.events.register(
      `${this.prefix}.move`,
      { type: "pointermove", target: "window", priority: BLOCK_DRAG_INPUT_PRIORITY },
      (event) => this.move(event),
    );
    this.editor.events.register(
      `${this.prefix}.up`,
      { type: "pointerup", target: "window", capture: true, priority: BLOCK_DRAG_INPUT_PRIORITY },
      (event) => this.finish(event.input),
    );
    this.editor.events.observe(
      `${this.prefix}.cancel`,
      { type: "pointercancel", target: "window", priority: BLOCK_DRAG_INPUT_PRIORITY },
      (event) => {
        if (event.input.pointerId === this.gesture?.pointerId) {
          this.cancel();
        }
      },
    );
    this.editor.events.register(
      `${this.prefix}.escape`,
      { type: "keydown", target: "window", priority: BLOCK_DRAG_INPUT_PRIORITY },
      (event) => {
        if (this.gesture && event.input.key === "Escape") {
          event.preventDefault();
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
    this.editor.events.observe(
      `${this.prefix}.scroll`,
      { type: "scroll", target: "window", capture: true, priority: BLOCK_DRAG_INPUT_PRIORITY },
      () => {
        if (this.gesture?.ids) {
          this.resolve(this.gesture);
        }
      },
    );
    this.editor.events.onDetach(() => this.cancel());
  }

  /**
   * Removes feedback and scheduled work without modifying document or selection.
   *
   * The document cursor marker is released after the last active preview is removed,
   * so another occurrence's simultaneous gesture retains its cursor and hover styles.
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
    const errors: unknown[] = [];
    for (const release of [
      () => gesture.autoScroll?.stop(),
      gesture.releasePointer,
      () => gesture.stopTargetDetach?.(),
      () => gesture.browser.feedback.clear(),
      () => gesture.sourceFeedback.clear(),
      () => gesture.browser.preview.clear(),
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
   * @param gesture - Gesture that encountered the failure; a replacement is left active.
   * @param error - Selection, geometry or permission failure that aborted delivery.
   * @returns Never returns; the original error remains observable.
   * @throws The original error, or AggregateError containing it and cleanup failures.
   */
  private cancelAfterFailure(gesture: BlockDragGesture, error: unknown): never {
    try {
      if (this.gesture === gesture) {
        this.cancel();
      }
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Block drag failed during cleanup");
    }
    throw error;
  }

  /**
   * Reserves a primary pointer from an explicitly marked handle in this occurrence.
   *
   * @param event - Normalized pointer input with nearest block identity.
   * @returns "handled" when the handle acquires pointer ownership; otherwise "continue".
   */
  private start(event: BlockInputEvent<"pointerdown">): BlockInputResult {
    const input = event.input;
    if (
      input.button !== 0 ||
      !input.isPrimary ||
      !event.blockId ||
      !input.target?.hasAncestor("[data-block-drag-handle]")
    ) {
      return "continue";
    }
    const active = input.captureRegion(
      "[data-block-id]",
      "[data-block-id]",
      "[data-rivto-block-editor]",
    );
    if (!active) {
      return "continue";
    }
    this.cancel();
    const browser = new BlockDragBrowser(event.root);
    const releasePointer = this.editor.pointer.acquire();
    if (!releasePointer) {
      return "continue";
    }
    event.preventDefault();
    this.gesture = {
      releasePointer,
      browser,
      inputRoot: event.root,
      createAutoScroll: input.createAutoScroll,
      sourceFeedback: new BlockDragSourceFeedback(event.root, active, event.blockId),
      pointerId: input.pointerId,
      activeId: event.blockId,
      startX: input.clientX,
      startY: input.clientY,
      x: input.clientX,
      y: input.clientY,
    };
    return "handled";
  }

  /**
   * Activates after four CSS pixels and updates only bounded DOM feedback.
   *
   * Losing the primary button completes the last displayed target when pointerup
   * was unavailable. Coordinates from movement after release never retarget it.
   * A last held position without an eligible target finishes without a move.
   *
   * @param input - Normalized window pointer input; unrelated pointers are ignored.
   * @returns "handled" for movement of the active pointer; otherwise "continue".
   * @throws Activation, target or host completion failures after cleanup; concurrent failures are aggregated.
   */
  private move(input: BlockInputEvent<"pointermove">): BlockInputResult {
    const event = input.input;
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return "continue";
    }
    if ((event.buttons & 1) === 0) {
      return this.finish(event);
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
      const hit = gesture.browser.uncapturedHit(input);
      try {
        // Scroll preflight reads styles and geometry before feedback changes the DOM.
        this.schedule(gesture, hit ? (input.input.target ?? undefined) : undefined);
        this.resolve(gesture, hit);
      } finally {
        hit?.release();
      }
    } catch (error) {
      this.cancelAfterFailure(gesture, error);
    }
    return "handled";
  }

  /**
   * Completes a real or inferred pointer release through one validating host transaction.
   *
   * A pointerup reads current geometry. Earlier pointerup handlers may release
   * capture, so hasPointerCapture can already be false while this event still
   * targets the capturing source. That native target cannot authorize a drop.
   * Movement keeps its native-hit optimization; release requests fresh geometry.
   * Window capture completes this operation before descendant controls can stop
   * release propagation. Later released-button movement sees no active gesture.
   * Native handle clicks continue through their ordinary browser delivery.
   * A released-button move instead completes the last displayed target after a
   * live permission check. Its later coordinates cannot alter that destination;
   * Escape, blur, pointercancel and detach still cancel without committing.
   * If the commit cancels the gesture by detaching an occurrence, focus is not
   * transferred to a replacement that happens to reuse the same element.
   *
   * @param event - Actual release or first movement reporting the primary button released.
   * @returns "handled" for release of a pending or active gesture; otherwise "continue".
   * @throws Host failures propagate after attempting every cleanup and focus restoration;
   * concurrent failures are reported together in an AggregateError.
   */
  private finish(event: BlockDragReleaseInput): BlockInputResult {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return "continue";
    }
    const errors: unknown[] = [];
    let focusScope: BlockDragTargetScope | undefined;
    try {
      const target = this.releaseTarget(gesture, event);
      if (target && gesture.ids) {
        if (this.adapter.moveBlocks(gesture.ids, target.destination, target.scope)) {
          focusScope = target.scope;
        }
      }
    } catch (error) {
      errors.push(error);
    }
    const mayFocus = this.gesture === gesture;
    try {
      this.cancel();
    } catch (error) {
      errors.push(error);
    }
    try {
      if (gesture.ids && mayFocus && gesture.inputRoot.isAttached()) {
        if (focusScope) {
          focusScope.focus();
        } else if (gesture.inputRoot.isConnected()) {
          gesture.inputRoot.focus();
        }
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
   * Resolves an actual release or revalidates the last displayed target after a lost release.
   *
   * Only pointerup coordinates describe the release location. A move with no
   * primary button arrives after release, so its coordinates cannot select a new
   * destination. Pending gestures and revoked cached targets do not move blocks.
   * Actual release updates the gesture coordinates and feedback during resolution;
   * inferred release reads the captured target without moving its visual frame.
   *
   * @param gesture - Captured sources and the last held pointer target.
   * @param event - Normalized release or movement reporting the primary button released.
   * @returns Current permitted target, or undefined for pending, neutral or rejected gestures.
   * @throws Propagates delegated geometry and permission failures to completion cleanup.
   */
  private releaseTarget(
    gesture: BlockDragGesture,
    event: BlockDragReleaseInput,
  ): ResolvedBlockDropTarget | undefined {
    if (!gesture.ids) {
      return undefined;
    }
    if (event.type === "pointerup") {
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      // Do not pass pointerup.target: earlier release handlers can clear capture
      // while this event still targets the source handle. Treating that handle
      // as the destination rejects a valid drop as a move into its own subtree.
      // Omit the native hint so the resolver hit-tests the final coordinates.
      this.resolve(gesture);
      return gesture.target;
    }
    const target = gesture.target;
    if (target && this.adapter.canMove(gesture.ids, target.destination, target.scope)) {
      return target;
    }
    return undefined;
  }

  /**
   * Resolves mounted targets and rejects a parent inside a captured source subtree.
   *
   * @param gesture - Active captured roots and latest viewport coordinates.
   * @param hit - Current uncaptured pointer hit; omitted when geometry must be re-read.
   * @returns Target highlight and count preview reflect the current permitted hit.
   * @throws Target or permission failures propagate after gesture resources are released.
   */
  private resolve(gesture: BlockDragGesture, hit?: BlockDragHit): void {
    if (this.gesture !== gesture) {
      return;
    }
    try {
      const target = this.resolveTarget(gesture, hit);
      if (this.gesture !== gesture) {
        return;
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
      gesture.browser.feedback.update(target);
      if (this.gesture !== gesture) {
        gesture.browser.feedback.clear();
        return;
      }
      // Resolve native geometry before inserting feedback: adding the preview can
      // invalidate hit-test data for the whole mounted document.
      if (!gesture.browser.preview.isCreated() && gesture.ids) {
        gesture.sourceFeedback.show(gesture.ids);
        if (this.gesture !== gesture) {
          gesture.sourceFeedback.clear();
          return;
        }
        this.createPreview(gesture, gesture.ids);
        if (this.gesture !== gesture) {
          gesture.browser.preview.clear();
          return;
        }
      }
      gesture.browser.preview.move(gesture.x, gesture.y);
    } catch (error) {
      this.cancelAfterFailure(gesture, error);
    }
  }

  /**
   * Chooses a permitted target while the source gesture remains current.
   *
   * Foreign targets must belong to the receiving region in the source document;
   * local targets cannot place a source inside its own selected subtree.
   *
   * @param gesture - Captured source roots and current viewport coordinates.
   * @param hit - Current uncaptured pointer hit, if available.
   * @returns Permitted target, or undefined after cancellation or rejection.
   * @throws Propagates target, ownership, model and host permission failures.
   */
  private resolveTarget(
    gesture: BlockDragGesture,
    hit?: BlockDragHit,
  ): ResolvedBlockDropTarget | undefined {
    const target = this.targets.resolve(gesture.x, gesture.y, gesture.selected ?? new Set(), hit);
    if (this.gesture !== gesture || !target) {
      return;
    }
    if (
      target.scope &&
      (!gesture.inputRoot.isInSameDocument(target.scope.region) ||
        !target.scope.region.containsRegion(target.anchor))
    ) {
      return;
    }
    if (this.gesture !== gesture) {
      return;
    }
    let parent = target.scope ? undefined : target.destination.parentId;
    while (parent) {
      if (gesture.selected?.has(parent)) {
        return;
      }
      parent = this.editor.adapter.blocks.getParentId(parent);
      if (this.gesture !== gesture) {
        return;
      }
    }
    if (gesture.ids && !this.adapter.canMove(gesture.ids, target.destination, target.scope)) {
      return;
    }
    return target;
  }

  /**
   * Creates non-interactive text feedback once, after target geometry has been read.
   *
   * The host bounds model reads. Page independently caps DOM rows, displayed text
   * and indentation; native textContent keeps markup inert. A document marker fixes
   * the cursor and suppresses handle hover until cleanup. Movement changes only
   * the outer transform and never asks the host for another snapshot.
   *
   * @param gesture - Owner responsible for removing the preview on every exit path.
   * @param ids - Captured canonical source roots used for the group count.
   * @returns At most four content rows and the source-root count are mounted if the gesture remains active.
   * @throws Host preview reads or DOM creation failures propagate to gesture cleanup.
   */
  private createPreview(gesture: BlockDragGesture, ids: readonly string[]): void {
    const rows = this.adapter.getPreview?.(ids, 4) ?? [];
    if (this.gesture !== gesture) {
      return;
    }
    gesture.browser.preview.create(ids.length, rows);
  }

  /**
   * Scrolls nested containers and the window near their edges, then resolves moved targets.
   *
   * @param gesture - Current gesture; cancellation prevents further scheduling.
   * @param hit - Current uncaptured normalized target, used only to skip unnecessary scroll frames.
   * @returns At most one scroll frame is pending; no selected subtree is traversed per frame.
   */
  private schedule(gesture: BlockDragGesture, hit?: InputTarget): void {
    if (!gesture.autoScroll) {
      gesture.autoScroll = gesture.createAutoScroll(
        () => this.resolve(gesture),
        () => gesture.inputRoot.isAttached(),
      );
    }
    gesture.autoScroll.update(gesture, hit);
  }
}
