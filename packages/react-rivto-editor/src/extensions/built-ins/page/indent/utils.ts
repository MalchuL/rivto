/**
 * Tab / Shift+Tab dispatch for outline indent and outdent.
 *
 * Eligibility stays here so a focused toolbar cannot indent. The resolved
 * behavior chain performs the semantic move; parent outline handlers and move
 * permissions turn an illegal indent or floor lift into a no-op.
 *
 * @module
 */
import { getSelectedBlockIds, isStructuralSelection } from "@chulane/rivto";
import type { ReactPanelApi } from "../../../../panels/types";
import { firstKeyboardTarget, isEditableKeyboardEvent } from "../../../../managers";
import { PageNavigationController } from "../../../../surfaces/page/page-navigation-controller";

/** Active viewport settlement for one page surface. */
interface ViewportSettlement {
  /** Block whose viewport position is retained across repeated commands. */
  readonly anchorId?: string;
  /** Latest intended viewport top, including deliberate user scrolling. */
  expectedTop?: number;
  /** Stops pending correction and restores normal virtual measurement behavior. */
  cancel(): void;
}

const viewportSettlements = new WeakMap<HTMLElement, ViewportSettlement>();

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
  selectionManager: Pick<
    ReactPanelApi["selection"],
    "readDOM" | "get" | "set" | "restoreDOM" | "scheduleIfSelectionUnchanged"
  >,
  root: HTMLElement,
  event: KeyboardEvent,
  outdent: boolean,
  reactPanel: ReactPanelApi,
): boolean {
  const editable = isEditableKeyboardEvent(event);
  const nativeSelection = editable ? selectionManager.readDOM() : undefined;
  if (nativeSelection) {
    selectionManager.set(nativeSelection);
  }
  const selection = nativeSelection ?? selectionManager.get();
  const target = firstKeyboardTarget(selection);
  if (!target) {
    return false;
  }
  const blockSelectionAtRoot = event.target === root && isStructuralSelection(target.item);
  if (!editable && !blockSelectionAtRoot) {
    return false;
  }

  if (!reactPanel.blocks.getBlockNode(target.blockId)) {
    return false;
  }
  const targetIds = getSelectedBlockIds(target.item);
  // Check the entire selection because outdenting a top-level child can cross the panel boundary.
  if (outdent && targetIds.some((id) => !reactPanel.blocks.canOutdent(id))) {
    return true;
  }
  // Reparenting a virtualized root block partially above the viewport changes
  // both the root count and its DOM parent. Preserve the viewport through that
  // render instead of letting browser scroll anchoring reveal the hidden row edge.
  const virtualizationController = PageNavigationController.getForElement(root);
  // Capture mounted targets before the reparent changes the virtual window.
  const selected = new Set(targetIds);
  const mountedTargetIds = [
    ...new Set(
      [...root.querySelectorAll<HTMLElement>("[data-block-id]")]
        .map((element) => element.dataset.blockId)
        .filter((id): id is string => Boolean(id && selected.has(id))),
    ),
  ];
  const previousSettlement = viewportSettlements.get(root);
  const inheritedAnchor =
    previousSettlement?.anchorId &&
    targetIds.includes(previousSettlement.anchorId) &&
    blockViewportTop(root, previousSettlement.anchorId) !== undefined &&
    previousSettlement.expectedTop !== undefined
      ? { id: previousSettlement.anchorId, top: previousSettlement.expectedTop }
      : undefined;
  previousSettlement?.cancel();
  const releaseScrollAdjustments = virtualizationController?.suspendScrollAdjustments();
  const scrollElement = virtualizationController ? root.ownerDocument.scrollingElement : null;
  let anchor: BlockViewportAnchor | undefined = inheritedAnchor;
  if (!anchor) {
    // Virtualized endpoints can be absent. Prefer a visible member near the viewport center.

    const viewportHeight = root.ownerDocument.defaultView?.innerHeight ?? 0;
    const viewportCenter = viewportHeight / 2;

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
      for (let index = targetIds.length - 1; index >= 0 && !id; index -= 1) {
        const blockId = targetIds[index]!;
        if (blockViewportTop(root, blockId) !== undefined) {
          id = blockId;
        }
      }
      const top = id ? blockViewportTop(root, id) : undefined;
      if (id && top !== undefined) {
        anchor = { id, top };
      }
    }
  }
  const anchorId = anchor?.id;
  const anchorTop = anchor?.top;
  const view = root.ownerDocument.defaultView;
  let settlementActive = true;
  let adjustmentsReleased = false;
  /** Applies deliberate wheel movement to the retained visual position. */
  const onWheel = (wheelEvent: WheelEvent): void => {
    if (settlement.expectedTop !== undefined) {
      settlement.expectedTop -= wheelEvent.deltaY;
    }
  };
  /** Restores normal virtualizer behavior once for this command. */
  const releaseAdjustments = (): void => {
    if (adjustmentsReleased) {
      return;
    }
    adjustmentsReleased = true;
    releaseScrollAdjustments?.();
  };
  const settlement: ViewportSettlement = {
    anchorId,
    expectedTop: anchorTop,
    cancel: () => {
      if (!settlementActive) {
        return;
      }
      settlementActive = false;
      view?.removeEventListener("wheel", onWheel);
      releaseAdjustments();
    },
  };
  viewportSettlements.set(root, settlement);
  view?.addEventListener("wheel", onWheel, { passive: true });
  const claimed = outdent
    ? reactPanel.blocks.outdentBlocks(targetIds)
    : reactPanel.blocks.indentBlocks(targetIds);
  // Selection state remains model-backed. Keep only the selected blocks that
  // were already in the virtual window mounted across the reparent; this
  // preserves local measurements without rendering the complete selection.
  // Mounting every selected root here makes a large outdent briefly defeat
  // virtualization, then the following indent replaces hundreds of measured
  // roots with one subtree and produces a large scroll offset correction.
  let mountIds = targetIds.slice(-1);
  if (mountedTargetIds.length) {
    mountIds = mountedTargetIds;
  } else if (anchorId) {
    mountIds = [anchorId];
  }
  virtualizationController?.mountBlocks(mountIds, { scroll: false });
  if (scrollElement && anchorId && anchorTop !== undefined) {
    restoreBlockViewportTop(root, scrollElement, anchorId, anchorTop);
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
    () => {
      // A newer command owns selection restoration once this settlement is cancelled.
      if (!settlementActive) {
        return;
      }
      // The controller captured before dispatch still indexes the old root list.
      // Resolve it again after React commits so an outdented viewport window is
      // pinned as new roots instead of being looked up in the former parent root.
      PageNavigationController.getForElement(root)?.mountBlocks(mountIds, { scroll: false });
      selectionManager.set(selection!);
      selectionManager.restoreDOM(selection, { scroll: false });
      if (!scrollElement || !anchorId || anchorTop === undefined) {
        settlement.cancel();
        if (viewportSettlements.get(root) === settlement) {
          viewportSettlements.delete(root);
        }
        return;
      }
      const deadline = (view?.performance.now() ?? 0) + 300;
      /** Preserves the visual anchor until virtual subtree measurements settle. */
      const stabilize = (): void => {
        if (!settlementActive) {
          return;
        }
        const expectedTop = settlement.expectedTop;
        if (expectedTop !== undefined) {
          restoreBlockViewportTop(root, scrollElement, anchorId, expectedTop);
        }
        if (view && view.performance.now() < deadline) {
          view.requestAnimationFrame(stabilize);
        } else {
          // Re-enabling ordinary virtual measurement behavior can itself apply
          // one deferred offset. Correct that final frame unless a newer command
          // has superseded this settlement.
          releaseAdjustments();
          view?.requestAnimationFrame(() => {
            if (!settlementActive) {
              return;
            }
            const expectedTop = settlement.expectedTop;
            if (expectedTop !== undefined) {
              restoreBlockViewportTop(root, scrollElement, anchorId, expectedTop);
            }
            settlementActive = false;
            view.removeEventListener("wheel", onWheel);
            if (viewportSettlements.get(root) === settlement) {
              viewportSettlements.delete(root);
            }
          });
        }
      };
      stabilize();
    },
    () => {
      settlement.cancel();
      if (viewportSettlements.get(root) === settlement) {
        viewportSettlements.delete(root);
      }
    },
  );
  return claimed;
}
