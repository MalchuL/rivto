import type { Selection } from "@chulane/rivto";
import type {
  DocumentScroll,
  FrameClock,
  InputRoot,
  RegionViewportSnapshot,
} from "@chulane/rivto-root";
import type { PanelSelectionApi } from "./api";
import type {
  BlockViewportAnchor,
  ViewportAttachmentCheck,
  ViewportSelectionAction,
  ViewportSettlement,
  ViewportRoot,
} from "./types";
import type { PageNavigationApi } from "../../surfaces/page/page-navigation-controller";

/** Active settlement is shared by successive commands in the same surface. */
const viewportSettlements = new WeakMap<object, ViewportSettlement>();

/**
 * Returns the viewport position of a rendered block used to anchor a reparent.
 *
 * @param root - Borrowed occurrence providing browser measurement.
 * @param blockId - Stable block ID to locate.
 * @returns The block's viewport top, or undefined while it is unmounted.
 */
function blockViewportTop(
  root: Pick<InputRoot, "readRegionViewportTop">,
  blockId: string,
): number | undefined {
  return root.readRegionViewportTop("data-block-id", blockId);
}

/**
 * Chooses the visible selected block nearest the viewport center.
 *
 * Large virtual selections commonly have both endpoints unmounted. Anchoring
 * a rendered member keeps the user's current reading position stable regardless
 * of which selected endpoint owns keyboard focus.
 *
 * @param snapshot - Measured selected regions in the current viewport.
 * @param inputRoot - Borrowed occurrence used for fallback measurement.
 * @param blockIds - Complete selected block IDs in document order.
 * @returns A visible anchor, or a mounted endpoint when none is visible.
 */
function selectedViewportAnchor(
  snapshot: RegionViewportSnapshot,
  inputRoot: Pick<InputRoot, "readRegionViewportTop">,
  blockIds: readonly string[],
): BlockViewportAnchor | undefined {
  const viewportHeight = snapshot.viewportHeight;
  const viewportCenter = viewportHeight / 2;
  let anchor: BlockViewportAnchor | undefined;
  let anchorDistance = Number.POSITIVE_INFINITY;
  for (const rect of snapshot.regions) {
    const id = rect.value;
    if (rect.bottom <= 0 || rect.top >= viewportHeight) {
      continue;
    }
    const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
    if (distance < anchorDistance) {
      anchor = { id, top: rect.top };
      anchorDistance = distance;
    }
  }
  if (!anchor) {
    let id: string | undefined;
    for (let index = blockIds.length - 1; index >= 0 && !id; index -= 1) {
      const blockId = blockIds[index]!;
      if (blockViewportTop(inputRoot, blockId) !== undefined) {
        id = blockId;
      }
    }
    const top = id ? blockViewportTop(inputRoot, id) : undefined;
    if (id && top !== undefined) {
      anchor = { id, top };
    }
  }
  return anchor;
}

/**
 * Compensates scroll for layout movement of a block that stayed selected.
 *
 * @param root - Borrowed occurrence providing browser measurement.
 * @param documentScroll - Captured capability for adjusting document scroll.
 * @param blockId - Stable block ID used as the visual anchor.
 * @param expectedTop - Its viewport top before the structural command.
 * @returns No value.
 */
function restoreBlockViewportTop(
  root: Pick<InputRoot, "readRegionViewportTop">,
  documentScroll: DocumentScroll,
  blockId: string,
  expectedTop: number,
): void {
  const currentTop = blockViewportTop(root, blockId);
  if (currentTop !== undefined) {
    documentScroll.adjustBy(currentTop - expectedTop);
  }
}

/** Preserves selection and viewport geometry across a structural command. */
export class SelectionViewport implements ViewportSettlement {
  anchorId?: string;
  expectedTop?: number;
  private anchorTop?: number;
  private active = true;
  private adjustmentsReleased = false;
  private releaseScrollAdjustments?: () => void;
  private releaseWheel?: () => void;
  private releaseFrame?: () => void;
  private documentScroll: DocumentScroll | undefined;
  private mountedIds: string[] = [];
  private mountIds: string[] = [];
  private deadline = 0;
  private readonly clock: FrameClock | undefined;

  /**
   * Captures the inputs needed by one viewport settlement without mutating them.
   *
   * @param surfaceIdentity - Opaque identity shared by attachments to the same surface.
   * @param inputRoot - Borrowed occurrence providing browser measurement.
   * @param navigation - Borrowed navigation for the originating panel.
   * @param selectionManager - Borrowed selection restoration operations.
   * @param selection - Portable selection captured before mutation.
   * @param targetIds - Selected blocks in document order.
   * @param isCurrent - Checks the exact originating panel registration.
   */
  private constructor(
    private readonly surfaceIdentity: object,
    private readonly inputRoot: ViewportRoot,
    private readonly navigation: Pick<
      PageNavigationApi,
      "isAttached" | "mountBlocks" | "suspendScrollAdjustments"
    >,
    private readonly selectionManager: Pick<
      PanelSelectionApi,
      "set" | "restoreDOM" | "scheduleIfSelectionUnchanged"
    >,
    private readonly selection: Selection,
    private readonly targetIds: readonly string[],
    private readonly isCurrent: ViewportAttachmentCheck,
  ) {
    this.clock = inputRoot.captureFrameClock();
  }

  /**
   * Executes one structural mutation and restores its captured selection and viewport.
   *
   * Mounted members are retained across virtualized reparenting, and later frames
   * stop touching the surface if the originating input registration changes.
   *
   * @param inputRoot - Borrowed occurrence providing browser measurement.
   * @param navigation - Borrowed navigation for the originating panel.
   * @param selectionManager - Borrowed selection restoration operations.
   * @param selection - Portable selection captured before mutation.
   * @param targetIds - Selected blocks in document order.
   * @param isCurrent - Checks the exact originating panel registration.
   * @param action - Synchronous structural operation supplied by the extension.
   * @returns Whether the structural operation claimed the shortcut.
   * @throws Propagates browser, selection, mounting, and mutation failures.
   */
  static run(
    inputRoot: ViewportRoot,
    navigation: Pick<PageNavigationApi, "isAttached" | "mountBlocks" | "suspendScrollAdjustments">,
    selectionManager: Pick<
      PanelSelectionApi,
      "set" | "restoreDOM" | "scheduleIfSelectionUnchanged"
    >,
    selection: Selection,
    targetIds: readonly string[],
    isCurrent: ViewportAttachmentCheck,
    action: ViewportSelectionAction,
  ): boolean {
    if (!isCurrent()) {
      return false;
    }
    const surfaceIdentity = inputRoot.getElementIdentity?.() ?? inputRoot;
    if (!isCurrent()) {
      return false;
    }
    const viewport = new SelectionViewport(
      surfaceIdentity,
      inputRoot,
      navigation,
      selectionManager,
      selection,
      targetIds,
      isCurrent,
    );
    try {
      if (!viewport.isCurrent()) {
        viewport.cancelAndForget();
        return false;
      }
      viewport.prepare();
      if (!viewport.isCurrent()) {
        viewport.cancelAndForget();
        return false;
      }
      const claimed = action();
      if (viewport.isCurrent()) {
        viewport.scheduleRestoration();
      } else {
        viewport.cancelAndForget();
      }
      return claimed;
    } catch (error) {
      try {
        viewport.cancelAndForget();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Viewport restoration cleanup failed");
      }
      throw error;
    }
  }

  /**
   * Stops the pending frame and wheel subscription and restores virtualizer adjustments.
   *
   * @returns All resources are offered cleanup once even when cancellation is repeated.
   * @throws AggregateError if one or more cleanup operations fail.
   */
  cancel(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    const releases = [this.releaseFrame, this.releaseWheel, () => this.releaseAdjustments()];
    this.releaseFrame = undefined;
    this.releaseWheel = undefined;
    const errors: unknown[] = [];
    for (const release of releases) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Viewport cleanup failed");
    }
  }

  /**
   * Captures the current visible anchor and suspends virtualizer adjustments.
   *
   * @returns This settlement replaces the previous settlement for the surface.
   * @throws Propagates browser geometry or virtualizer failures.
   */
  private prepare(): void {
    // Reparenting a virtualized root block partially above the viewport changes
    // both the root count and its DOM parent. Preserve the viewport through that
    // render instead of letting browser scroll anchoring reveal the hidden row edge.
    const navigation = this.navigation.isAttached() ? this.navigation : undefined;
    this.mountedIds = [...this.inputRoot.readRegionValues("data-block-id", this.targetIds)];
    const previous = viewportSettlements.get(this.surfaceIdentity);
    const inherited =
      previous?.anchorId &&
      this.targetIds.includes(previous.anchorId) &&
      blockViewportTop(this.inputRoot, previous.anchorId) !== undefined &&
      previous.expectedTop !== undefined
        ? { id: previous.anchorId, top: previous.expectedTop }
        : undefined;
    previous?.cancel();
    this.releaseScrollAdjustments = navigation?.suspendScrollAdjustments();
    this.documentScroll = navigation ? this.inputRoot.captureDocumentScroll() : undefined;
    const snapshot = inherited
      ? undefined
      : this.inputRoot.measureRegionViewportBounds("data-block-id", this.targetIds);
    const anchor =
      inherited ?? (snapshot && selectedViewportAnchor(snapshot, this.inputRoot, this.targetIds));
    this.anchorId = anchor?.id;
    this.anchorTop = anchor?.top;
    this.expectedTop = anchor?.top;
    viewportSettlements.set(this.surfaceIdentity, this);
    const releaseWheel = this.inputRoot.observeWindowWheel(this.onWheel);
    if (this.active) {
      this.releaseWheel = releaseWheel;
    } else {
      releaseWheel();
    }
  }

  /**
   * Mounts the existing virtual window and schedules selection restoration.
   *
   * @returns The visible anchor is corrected and one selection callback is scheduled.
   * @throws Propagates mounting, browser geometry, and scheduling failures.
   */
  private scheduleRestoration(): void {
    // Selection state remains model-backed. Keep only the selected blocks that
    // were already in the virtual window mounted across the reparent; this
    // preserves local measurements without rendering the complete selection.
    // Mounting every selected root here makes a large outdent briefly defeat
    // virtualization, then the following indent replaces hundreds of measured
    // roots with one subtree and produces a large scroll offset correction.
    this.mountIds = this.targetIds.slice(-1);
    if (this.mountedIds.length) {
      this.mountIds = this.mountedIds;
    } else if (this.anchorId) {
      this.mountIds = [this.anchorId];
    }
    if (this.navigation.isAttached()) {
      this.navigation.mountBlocks(this.mountIds, { scroll: false });
    }
    if (!this.canRestore()) {
      return;
    }
    if (this.documentScroll && this.anchorId && this.anchorTop !== undefined) {
      restoreBlockViewportTop(this.inputRoot, this.documentScroll, this.anchorId, this.anchorTop);
    }
    // React may reparent every selected block shell and cause the browser to emit
    // a transient empty selectionchange. Re-publish the selection captured
    // before the command, then resolve its text endpoints in the committed DOM.
    // Virtual measurements can settle across several frames for a large moved
    // subtree. Track deliberate scrolling between frames and preserve that
    // movement while compensating only for changes in the anchor's layout.
    // This callback owns caret/selection restoration, not the indent mutation. Mounting
    // endpoints and preserving the viewport support that restoration; unrelated work
    // must not use this slot because a newer selection callback replaces it.
    this.selectionManager.scheduleIfSelectionUnchanged(this.restore, this.cancelAndForget);
  }

  /**
   * Applies deliberate wheel movement to the retained visual position.
   *
   * @param deltaY - Vertical wheel delta in browser-reported units.
   * @returns The retained anchor follows deliberate scrolling while the registration is current.
   */
  private readonly onWheel = (deltaY: number): void => {
    if (!this.isCurrent()) {
      this.cancelAndForget();
      return;
    }
    if (this.expectedTop !== undefined) {
      this.expectedTop -= deltaY;
    }
  };

  /**
   * Restores normal virtualizer behavior once for this command.
   *
   * @returns The suspension is released at most once.
   */
  private releaseAdjustments(): void {
    if (this.adjustmentsReleased) {
      return;
    }
    this.adjustmentsReleased = true;
    this.releaseScrollAdjustments?.();
  }

  /**
   * Releases this settlement and removes only its own retained surface entry.
   *
   * @returns The wheel listener and virtualizer suspension have been released.
   */
  private readonly cancelAndForget = (): void => {
    try {
      this.cancel();
    } finally {
      if (viewportSettlements.get(this.surfaceIdentity) === this) {
        viewportSettlements.delete(this.surfaceIdentity);
      }
    }
  };

  /**
   * Checks whether deferred viewport work still belongs to its original registration.
   *
   * @returns False after cancellation or replacement; stale resources are released.
   */
  private canRestore(): boolean {
    if (!this.active || !this.isCurrent()) {
      this.cancelAndForget();
      return false;
    }
    return true;
  }

  /**
   * Restores captured selection and begins correction after React commits.
   *
   * @returns Selection restoration and any required frame corrections are initiated.
   * @throws Propagates mounting, selection, or browser failures.
   */
  private readonly restore = (): void => {
    // A newer command owns selection restoration once this settlement is cancelled.
    if (!this.canRestore()) {
      return;
    }
    // The borrowed controller reads current model order after React commits.
    // Mount again at that point so an outdented viewport window is pinned as
    // new roots instead of being looked up in its former parent's root list.
    if (this.navigation.isAttached()) {
      this.navigation.mountBlocks(this.mountIds, { scroll: false });
    }
    if (!this.canRestore()) {
      return;
    }
    this.selectionManager.set(this.selection);
    if (!this.canRestore()) {
      return;
    }
    this.selectionManager.restoreDOM(this.selection, { scroll: false });
    if (!this.canRestore()) {
      return;
    }
    if (!this.documentScroll || !this.anchorId || this.anchorTop === undefined) {
      this.cancelAndForget();
      return;
    }
    const now = this.clock?.now();
    if (now === undefined) {
      this.cancelAndForget();
      return;
    }
    this.deadline = now + 300;
    this.stabilize();
  };

  /**
   * Preserves the visual anchor until virtual subtree measurements settle.
   *
   * @returns Schedules the next correction or releases the completed settlement.
   */
  private readonly stabilize = (): void => {
    if (!this.canRestore()) {
      return;
    }
    if (this.documentScroll && this.anchorId && this.expectedTop !== undefined) {
      restoreBlockViewportTop(this.inputRoot, this.documentScroll, this.anchorId, this.expectedTop);
    }
    const now = this.clock?.now();
    if (now === undefined) {
      this.cancelAndForget();
      return;
    }
    if (now < this.deadline) {
      this.scheduleFrame(this.stabilize);
    } else {
      // Re-enabling ordinary virtual measurement behavior can itself apply
      // one deferred offset. Correct that final frame unless a newer command
      // has superseded this settlement.
      this.releaseAdjustments();
      this.scheduleFrame(this.finish);
    }
  };

  /**
   * Schedules one owned correction frame or releases a cancelled settlement.
   *
   * @param callback - Correction to run at the next accepted frame.
   * @returns The frame is retained only while this settlement remains active.
   * @throws Propagates frame scheduling and cancellation failures.
   */
  private scheduleFrame(callback: () => void): void {
    let invoked = false;
    const release = this.clock?.requestFrame(() => {
      invoked = true;
      this.releaseFrame = undefined;
      callback();
    });
    if (!release) {
      this.cancelAndForget();
    } else if (!this.active || invoked) {
      release();
    } else {
      this.releaseFrame = release;
    }
  }

  /**
   * Applies the final anchor correction after releasing virtualizer adjustments.
   *
   * @returns The completed settlement and wheel listener are released.
   */
  private readonly finish = (): void => {
    if (!this.canRestore()) {
      return;
    }
    if (this.documentScroll && this.anchorId && this.expectedTop !== undefined) {
      restoreBlockViewportTop(this.inputRoot, this.documentScroll, this.anchorId, this.expectedTop);
    }
    this.cancel();
    if (viewportSettlements.get(this.surfaceIdentity) === this) {
      viewportSettlements.delete(this.surfaceIdentity);
    }
  };
}
