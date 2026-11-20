import { BlockSelectionEndpoints } from "@chulane/rivto-page";
/**
 * Shared selection and focus operations for page navigation registrations.
 *
 * @module
 */
import {
  assertBlockRangeEndpoints,
  createCaretSelection,
  type EditorPosition,
  type DocumentEditorAPI,
  type Selection,
} from "@chulane/rivto";
import type { NavigationCaretPanel, NavigationPanel } from "./types";
import type { PanelSelectionApi } from "../../../../../managers/selection/api";
import { pageEntries } from "./outline";
import { navigationOutlineBlocks } from "./scope";
import type { VerticalDirection } from "./types";

export type { VerticalDirection } from "./types";

/**
 * Reads the live DOM selection before the portable fallback.
 *
 * @param selectionManager - React selection capability.
 * @returns Current selection when present.
 */
export function currentNavigationSelection(
  selectionManager: Pick<PanelSelectionApi, "get" | "readDOM">,
): Selection | undefined {
  return selectionManager.readDOM() ?? selectionManager.get();
}

/**
 * Publishes and focuses one caret position.
 *
 * @param reactPanel - Owning editor view.
 * @param position - Target portable position.
 * @returns No value.
 */
export function setNavigationCaret(
  reactPanel: NavigationCaretPanel,
  position: EditorPosition,
): void {
  reactPanel.selection.set(createCaretSelection(position.blockId, position.offset));
  reactPanel.selection.focusBlock(position.blockId, position.offset);
}

/**
 * Resolves the document-order edge of a text selection.
 *
 * @param reactPanel - Owning editor view.
 * @param editor - Core editor API.
 * @param selection - Text-like portable selection.
 * @param edge - Requested logical edge.
 * @returns Position at that edge.
 */
export function textSelectionEdge(
  reactPanel: NavigationPanel,
  editor: NavigationPanel | DocumentEditorAPI,
  selection: Selection,
  edge: "start" | "end",
): EditorPosition {
  const documentEditor = "editor" in editor ? editor.document : editor;
  assertBlockRangeEndpoints(selection);
  const lengthOf = (id: string) => documentEditor.blocks.getBlockNode(id)?.content.length ?? 0;
  const ends = BlockSelectionEndpoints.resolve(selection, lengthOf);
  if (!ends) {
    return { blockId: selection.focusBlockId, offset: 0 };
  }
  const ids =
    reactPanel.selection.selectableBlockIds() ??
    pageEntries(
      navigationOutlineBlocks(editor, selection.focusBlockId),
      null,
      false,
      // Order text-selection endpoints using the same visible outline as keyboard navigation.
      (block) => !reactPanel.editor.blockBehaviors.childrenVisible(block),
    ).map(({ block }) => block.id);
  const anchorIndex = ids.indexOf(ends.anchor.blockId);
  const headIndex = ids.indexOf(ends.head.blockId);
  const forward =
    anchorIndex < headIndex ||
    (anchorIndex === headIndex && ends.anchor.offset <= ends.head.offset);
  const start = forward ? ends.anchor : ends.head;
  const stop = forward ? ends.head : ends.anchor;
  return edge === "start" ? start : stop;
}
