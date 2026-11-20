import type { RegionIdentity } from "@chulane/rivto-root";
import { isCaretSelection, resolveBlockRange, type Selection } from "@chulane/rivto";
import { useLayoutEffect, type RefObject } from "react";
import { BLOCK_CONTENT_SELECTOR, BLOCK_SELECTION_ANCHOR_ATTRIBUTE } from "../../constants";
import { useReactPanel } from "../editor/use-react-panel";
import { PANEL_SELECTOR } from "../../panels/panel-dom";
import type { PanelInputRoot, ReactPanelSurfaceApi } from "../../panels/types";

import type { BlockSelectionAnchorAttributes } from "./types";
export type { BlockSelectionAnchorAttributes } from "./types";

const selectionAnchorAttributes: BlockSelectionAnchorAttributes = {
  [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "",
};

/**
 * Restores a pending command's focus when its renderer mounts or changes editor or ID.
 *
 * Work runs after layout effects in a microtask and is discarded if the selection,
 * panel registration, or mounted renderer changes. Text renderers restore a caret;
 * contentless renderers focus the originating surface and clear browser ranges.
 *
 * @param blockId - Stable block ID owning the pending caret.
 * @param identityRef - Mounted text editable identity; when omitted, focus returns to the surface root.
 * @returns Queues restoration when applicable; layout cleanup cancels stale work.
 * @throws Propagates browser focus and selection failures during deferred restoration.
 */
export function useRestoreBlockFocus(
  blockId: string,
  identityRef?: RefObject<RegionIdentity | undefined>,
): void {
  const reactPanel = useReactPanel();
  /** Restores a pending command's caret after commit; cleanup cancels stale work. */
  useLayoutEffect(() => {
    const identity = identityRef?.current;
    const inputRoot = reactPanel.inputRoot;
    if (
      (identityRef && !identity) ||
      !inputRoot ||
      !reactPanel.selection.hasPendingSelectionCallback
    ) {
      return;
    }
    const selection = reactPanel.selection.snapshot();
    if (selection?.focusBlockId !== blockId || !isCaretSelection(selection)) {
      return;
    }

    // A structural command remounts the focused editable before its scheduled
    // frame. Restore its caret immediately after the commit so the next key cannot land
    // on the document body. Only the pending command's own caret may take focus;
    // expanded ranges still wait until every endpoint has synchronized its text.
    // A contentless renderer uses the surface root so shortcuts such as undo
    // remain available after its previous editable element has been removed.
    let mounted = true;
    // Wait for the remaining layout effects without waiting for a paint.
    // Focusing inside the commit forces layout while React is still updating
    // sibling blocks. A newer selection or an unmount invalidates this work.
    queueMicrotask(() => {
      if (
        !mounted ||
        !inputRoot.isConnected() ||
        reactPanel.inputRoot !== inputRoot ||
        !reactPanel.selection.hasPendingSelectionCallback ||
        reactPanel.selection.snapshot() !== selection
      ) {
        return;
      }
      if (identity) {
        restoreTextCaret(inputRoot, reactPanel, identity, selection.blocks[0]!);
      } else {
        inputRoot.focus();
        if (inputRoot.isConnected() && reactPanel.inputRoot === inputRoot) {
          inputRoot.clearSelection();
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, [reactPanel, blockId, identityRef]);
}

/**
 * Marks one contentless region for whole-block selection and restores pending focus.
 * Enter/Tab behavior, clipboard policy, block selection, and slash commands remain
 * extension responsibilities. Interactive descendants must respect defaultPrevented.
 * @param blockId - Stable ID of the structural block; no document subscription is created.
 * @returns Stable presence attributes to spread on the single structural selection region.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useBlockSelectionAnchor(blockId: string): BlockSelectionAnchorAttributes {
  useRestoreBlockFocus(blockId);
  return selectionAnchorAttributes;
}

/**
 * Focuses the captured editable and restores a caret only in that same host.
 *
 * A focus handler may replace the panel occurrence or focus another editable;
 * both cases discard the pending restoration.
 *
 * @param inputRoot - Borrowed occurrence that owns the editable.
 * @param panel - Current panel registration used to detect replacement.
 * @param identity - Opaque identity captured from the mounted editable.
 * @param range - Pending block range whose start determines the caret offset.
 * @returns The caret is restored when the captured host remains focused and owned.
 * @throws Propagates browser focus, text, selection, and ownership failures.
 */
function restoreTextCaret(
  inputRoot: Pick<
    PanelInputRoot,
    "focusRegionByIdentity" | "captureFocusedRegion" | "captureFocusedTextHost" | "isAttached"
  >,
  panel: Pick<ReactPanelSurfaceApi, "inputRoot">,
  identity: RegionIdentity,
  range: Selection["blocks"][number],
): void {
  if (!inputRoot.focusRegionByIdentity(identity, PANEL_SELECTOR)) {
    return;
  }
  const focused = inputRoot.captureFocusedRegion(BLOCK_CONTENT_SELECTOR, PANEL_SELECTOR);
  const host = inputRoot.captureFocusedTextHost?.(BLOCK_CONTENT_SELECTOR, PANEL_SELECTOR);
  if (!inputRoot.isAttached() || focused?.getIdentity() !== identity || !host) {
    return;
  }
  const offset = resolveBlockRange(host.readText().length, range.start, range.end).startOffset;
  if (inputRoot.isAttached() && panel.inputRoot === inputRoot) {
    host.restoreCaret(offset);
  }
}
