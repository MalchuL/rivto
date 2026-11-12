/**
 * Tab / Shift+Tab dispatch for outline indent and outdent.
 *
 * Eligibility stays here so a focused toolbar cannot indent. The resolved
 * behavior chain performs the semantic move; parent outline handlers and move
 * permissions turn an illegal indent or floor lift into a no-op.
 *
 * @module
 */
import { getSelectedBlockIds, isStructuralSelection, type Selection } from "@chulane/rivto";
import { createBlockOutlineContext } from "../../../../block-behaviors/utils/context";
import type { BlockOutlineContext } from "../../../../block-behaviors/types";
import type { ReactPanelApi } from "../../../../panels/types";
import { firstKeyboardTarget, isEditableKeyboardEvent } from "../../../../managers";
import type { PanelSelectionApi } from "../../../../managers/selection/api";
import {
  PageNavigationController,
  type PageNavigationApi,
} from "../../../../surfaces/page/page-navigation-controller";

/** Active viewport settlement for each page surface. */
const viewportSettlements = new WeakMap<HTMLElement, ViewportSettlement>();

/** Captured selection and block context for one eligible indent shortcut. */
interface IndentShortcutTarget {
  /** Selection to restore after the structural command. */
  readonly selection: Selection | undefined;
  /** Context passed to the target block's behavior. */
  readonly context: BlockOutlineContext;
  /** Selected structural IDs or the active text block ID. */
  readonly blockIds: string[];
}

/**
 * Resolves a keyboard shortcut to its selected blocks and outline context.
 *
 * An editable DOM selection is published before resolving the target. Noneditable
 * events qualify only for structural selections focused on the page root.
 *
 * @param selectionManager - Selection bridge used to read and publish DOM state.
 * @param root - Active page surface or edgeless card.
 * @param event - Native keyboard event that matched the binding.
 * @param reactPanel - Panel supplying the current outline context.
 * @returns The captured command target, or undefined when the shortcut is ineligible.
 */
function resolveIndentShortcutTarget(
  selectionManager: PanelSelectionApi,
  root: HTMLElement,
  event: KeyboardEvent,
  reactPanel: ReactPanelApi,
): IndentShortcutTarget | undefined {
  const editable = isEditableKeyboardEvent(event);
  const nativeSelection = editable ? selectionManager.readDOM() : undefined;
  if (nativeSelection) {
    selectionManager.set(nativeSelection);
  }
  const selection = nativeSelection ?? selectionManager.get();
  const target = firstKeyboardTarget(selection);
  if (!target) {
    return undefined;
  }
  const blockSelectionAtRoot = event.target === root && isStructuralSelection(target.item);
  if (!editable && !blockSelectionAtRoot) {
    return undefined;
  }
  const context = createBlockOutlineContext(reactPanel, target.blockId, selection);
  if (!context) {
    return undefined;
  }
  return { selection, context, blockIds: getSelectedBlockIds(target.item) };
}

/**
 * Returns the viewport position of a rendered block used to anchor a reparent.
 *
 * @param root - Page surface containing the block.
 * @param blockId - Stable block ID to locate.
 * @returns The block's viewport top, or undefined while it is unmounted.
 */
function blockViewportTop(root: HTMLElement, blockId: string): number | undefined {
  return root
    .querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
    ?.getBoundingClientRect().top;
}

/** A selected block whose screen position can anchor a structural command. */
interface BlockViewportAnchor {
  /** Stable block identifier. */
  readonly id: string;
  /** Viewport top before the command. */
  readonly top: number;
}

/**
 * Chooses the visible selected block nearest the viewport center.
 *
 * Large virtual selections commonly have both endpoints unmounted. Anchoring
 * a rendered member keeps the user's current reading position stable regardless
 * of which selected endpoint owns keyboard focus.
 *
 * @param root - Page surface containing mounted members of the selection.
 * @param blockIds - Complete selected block IDs in document order.
 * @returns A visible anchor, or a mounted endpoint when none is visible.
 */
function selectedViewportAnchor(
  root: HTMLElement,
  blockIds: readonly string[],
): BlockViewportAnchor | undefined {
  const selected = new Set(blockIds);
  const viewportHeight = root.ownerDocument.defaultView?.innerHeight ?? 0;
  const viewportCenter = viewportHeight / 2;
  let anchor: BlockViewportAnchor | undefined;
  let anchorDistance = Number.POSITIVE_INFINITY;
  for (const element of root.querySelectorAll<HTMLElement>("[data-block-id]")) {
    const id = element.dataset.blockId;
    if (!id || !selected.has(id)) {
      continue;
    }
    const rect = element.getBoundingClientRect();
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
      if (blockViewportTop(root, blockId) !== undefined) {
        id = blockId;
      }
    }
    const top = id ? blockViewportTop(root, id) : undefined;
    if (id && top !== undefined) {
      anchor = { id, top };
    }
  }
  return anchor;
}

/**
 * Returns selected blocks already represented in the current virtual window.
 *
 * @param root - Page surface containing the mounted window.
 * @param blockIds - Complete selected block IDs.
 * @returns Mounted selected IDs without duplicates.
 */
function mountedSelectedBlockIds(root: HTMLElement, blockIds: readonly string[]): string[] {
  const selected = new Set(blockIds);
  return [
    ...new Set(
      [...root.querySelectorAll<HTMLElement>("[data-block-id]")]
        .map((element) => element.dataset.blockId)
        .filter((id): id is string => Boolean(id && selected.has(id))),
    ),
  ];
}

/**
 * Compensates scroll for layout movement of a block that stayed selected.
 *
 * @param root - Page surface containing the block.
 * @param scrollElement - Document scrolling element to adjust.
 * @param blockId - Stable block ID used as the visual anchor.
 * @param expectedTop - Its viewport top before the structural command.
 * @returns No value.
 */
function restoreBlockViewportTop(
  root: HTMLElement,
  scrollElement: Element,
  blockId: string,
  expectedTop: number,
): void {
  const currentTop = blockViewportTop(root, blockId);
  if (currentTop !== undefined) {
    scrollElement.scrollTop += currentTop - expectedTop;
  }
}

/**
 * Applies one semantic indent or outdent binding through the target block view.
 *
 * Whole-block selections indent or outdent every selected ID as one group. A
 * text caret indents only the focused block. The DOM event is used only to
 * confirm that the shortcut originated in editable page content or from a
 * whole-block selection focused on the page root.
 *
 * @param selectionManager - React selection bridge used to restore the caret.
 * @param root - Active page surface or edgeless card.
 * @param event - Native keyboard event that matched the binding.
 * @param outdent - Whether this invocation lifts rather than nests.
 * @param reactPanel - Editor view used to resolve the target block view.
 * @returns `true` when the shortcut was claimed.
 */
export function applyIndentShortcut(
  selectionManager: PanelSelectionApi,
  root: HTMLElement,
  event: KeyboardEvent,
  outdent: boolean,
  reactPanel: ReactPanelApi,
): boolean {
  const target = resolveIndentShortcutTarget(selectionManager, root, event, reactPanel);
  if (!target) {
    return false;
  }
  const { selection, context, blockIds: targetIds } = target;
  const settlement = new ViewportSettlement(root, targetIds, reactPanel);
  const claimed = reactPanel.editor.blockBehaviors.dispatch(
    outdent ? "onOutdent" : "onIndent",
    context,
    targetIds,
  );
  settlement.preserveSelection(selectionManager, selection, targetIds);
  return claimed;
}

/**
 * Preserves an indent command's viewport anchor and selection through rendering.
 *
 * The panel owns cancellation; a later command on the same surface replaces this
 * settlement. The settlement owns its wheel listener, animation frame, and temporary
 * virtualizer scroll-adjustment suspension until cancellation or completion.
 */
class ViewportSettlement {
  /** Block whose viewport position is retained across repeated commands. */
  readonly anchorId?: string;
  /** Latest intended viewport top, including deliberate user scrolling. */
  expectedTop?: number;
  private readonly anchorTop?: number;
  private readonly view: Window | null;
  private readonly scrollElement: Element | null;
  private readonly controller:
    Pick<PageNavigationApi, "mountBlocks" | "suspendScrollAdjustments"> | undefined;
  private readonly mountedTargetIds: string[];
  /**
   * Releases the virtualizer's scroll-adjustment suspension.
   *
   * @returns Normal scroll-adjustment behavior is restored when this suspension ends.
   */
  private readonly releaseScrollAdjustments?: () => void;
  private active = true;
  private adjustmentsReleased = false;
  /**
   * Removes the panel-owned settlement cleanup registration.
   *
   * @returns The panel no longer retains this registration.
   * @throws If the registered cleanup fails.
   */
  private releasePanel?: () => void;
  /**
   * Removes the panel deactivation listener for this settlement.
   *
   * @returns The deactivation listener is detached.
   */
  private unsubscribeDeactivation?: () => void;
  private frame?: number;

  /**
   * Captures the viewport before dispatch and registers panel-owned cleanup.
   *
   * @param root - Surface whose viewport and selection are being preserved.
   * @param targetIds - Blocks selected before the structural command.
   * @param panel - Panel that cancels this settlement on deactivation or destruction.
   * @throws If panel cleanup or deactivation registration fails.
   */
  constructor(
    private readonly root: HTMLElement,
    targetIds: readonly string[],
    panel: Pick<ReactPanelApi, "registerCleanup" | "subscribeDeactivation">,
  ) {
    // Reparenting a virtualized root block partially above the viewport changes
    // both the root count and its DOM parent. Preserve the viewport through that
    // render instead of letting browser scroll anchoring reveal the hidden row edge.
    this.controller = PageNavigationController.getForElement(root);
    this.mountedTargetIds = mountedSelectedBlockIds(root, targetIds);
    const previous = viewportSettlements.get(root);
    const inheritedAnchor =
      previous?.anchorId &&
      targetIds.includes(previous.anchorId) &&
      blockViewportTop(root, previous.anchorId) !== undefined &&
      previous.expectedTop !== undefined
        ? { id: previous.anchorId, top: previous.expectedTop }
        : undefined;
    previous?.cancel();
    this.releaseScrollAdjustments = this.controller?.suspendScrollAdjustments();
    this.scrollElement = this.controller ? root.ownerDocument.scrollingElement : null;
    const anchor = inheritedAnchor ?? selectedViewportAnchor(root, targetIds);
    this.anchorId = anchor?.id;
    this.anchorTop = anchor?.top;
    this.expectedTop = anchor?.top;
    this.view = root.ownerDocument.defaultView;
    try {
      this.releasePanel = panel.registerCleanup(() => this.cancel());
      this.unsubscribeDeactivation = panel.subscribeDeactivation(() => this.cancel());
    } catch (error) {
      this.cancel();
      throw error;
    }
    viewportSettlements.set(root, this);
    this.view?.addEventListener("wheel", this.onWheel, { passive: true });
  }

  /**
   * Restores virtual mounts, viewport, and selection after the structural command.
   *
   * @param selectionManager - Selection bridge that owns DOM restoration scheduling.
   * @param selection - Selection captured before the command.
   * @param targetIds - IDs supplied to the structural command.
   * @returns Selection restoration is scheduled and the current viewport is corrected.
   */
  preserveSelection(
    selectionManager: Pick<
      PanelSelectionApi,
      "scheduleIfSelectionUnchanged" | "set" | "restoreDOM"
    >,
    selection: Selection | undefined,
    targetIds: readonly string[],
  ): void {
    // Selection state remains model-backed. Keep only the selected blocks that
    // were already in the virtual window mounted across the reparent; this
    // preserves local measurements without rendering the complete selection.
    // Mounting every selected root here makes a large outdent briefly defeat
    // virtualization, then the following indent replaces hundreds of measured
    // roots with one subtree and produces a large scroll offset correction.
    let mountIds = targetIds.slice(-1);
    if (this.mountedTargetIds.length) {
      mountIds = this.mountedTargetIds;
    } else if (this.anchorId) {
      mountIds = [this.anchorId];
    }
    this.controller?.mountBlocks(mountIds, { scroll: false });
    if (this.scrollElement && this.anchorId && this.anchorTop !== undefined) {
      restoreBlockViewportTop(this.root, this.scrollElement, this.anchorId, this.anchorTop);
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
    selectionManager.scheduleIfSelectionUnchanged(
      () => this.restoreSelection(selectionManager, selection, mountIds),
      () => this.finish(),
    );
  }

  /**
   * Stops pending corrections and releases all settlement-owned listeners.
   *
   * @returns The scheduled frame, wheel listener, panel registrations, and suspension are released.
   * @throws If a delegated cleanup fails.
   */
  cancel(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    if (this.frame !== undefined) {
      this.view?.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    this.view?.removeEventListener("wheel", this.onWheel);
    const release = this.releasePanel;
    this.releasePanel = undefined;
    try {
      this.releaseAdjustments();
    } finally {
      this.unsubscribeDeactivation?.();
      this.unsubscribeDeactivation = undefined;
      release?.();
    }
  }

  /**
   * Applies deliberate wheel movement to the retained visual position.
   *
   * @param event - Wheel event whose vertical delta adjusts the expected anchor position.
   * @returns The expected anchor position includes the user's vertical scroll.
   */
  private readonly onWheel = (event: WheelEvent): void => {
    if (this.expectedTop !== undefined) {
      this.expectedTop -= event.deltaY;
    }
  };

  /**
   * Restores the captured selection after React commits the reparented blocks.
   *
   * @param selectionManager - Selection bridge owning the scheduled callback.
   * @param selection - Selection captured before the command.
   * @param mountIds - Previously mounted selected blocks or the chosen anchor.
   * @returns Selection is restored and viewport stabilization begins when possible.
   */
  private restoreSelection(
    selectionManager: Pick<PanelSelectionApi, "set" | "restoreDOM">,
    selection: Selection | undefined,
    mountIds: readonly string[],
  ): void {
    // A newer command owns selection restoration once this settlement is cancelled.
    if (!this.active) {
      return;
    }
    // The controller captured before dispatch still indexes the old root list.
    // Resolve it again after React commits so an outdented viewport window is
    // pinned as new roots instead of being looked up in the former parent root.
    PageNavigationController.getForElement(this.root)?.mountBlocks(mountIds, { scroll: false });
    selectionManager.set(selection!);
    selectionManager.restoreDOM(selection, { scroll: false });
    if (!this.scrollElement || !this.anchorId || this.anchorTop === undefined) {
      this.finish();
      return;
    }
    this.stabilize((this.view?.performance.now() ?? 0) + 300);
  }

  /**
   * Preserves the visual anchor until virtual subtree measurements settle.
   *
   * @param deadline - Window performance timestamp after which corrections stop.
   * @returns The current position is corrected and a later frame is scheduled when available.
   */
  private stabilize(deadline: number): void {
    if (!this.active) {
      return;
    }
    this.restoreAnchor();
    if (this.view && this.view.performance.now() < deadline) {
      this.frame = this.view.requestAnimationFrame(() => this.stabilize(deadline));
    } else {
      // Re-enabling ordinary virtual measurement behavior can itself apply
      // one deferred offset. Correct that final frame unless a newer command
      // has superseded this settlement.
      this.releaseAdjustments();
      this.frame = this.view?.requestAnimationFrame(() => {
        if (!this.active) {
          return;
        }
        this.restoreAnchor();
        this.finish();
      });
    }
  }

  /**
   * Restores the current anchor position after a virtual layout change.
   *
   * @returns The scrolling element is adjusted when an anchor and expected top exist.
   */
  private restoreAnchor(): void {
    if (this.scrollElement && this.anchorId && this.expectedTop !== undefined) {
      restoreBlockViewportTop(this.root, this.scrollElement, this.anchorId, this.expectedTop);
    }
  }

  /**
   * Cancels this settlement and removes it only if it still owns the surface.
   *
   * @returns The settlement is released and its current registry entry is removed.
   * @throws If delegated cleanup fails.
   */
  private finish(): void {
    this.cancel();
    if (viewportSettlements.get(this.root) === this) {
      viewportSettlements.delete(this.root);
    }
  }

  /**
   * Restores normal virtualizer behavior once for this command.
   *
   * @returns The virtualizer's scroll-adjustment suspension is released at most once.
   * @throws If the suspension release fails.
   */
  private releaseAdjustments(): void {
    if (this.adjustmentsReleased) {
      return;
    }
    this.adjustmentsReleased = true;
    this.releaseScrollAdjustments?.();
  }
}
