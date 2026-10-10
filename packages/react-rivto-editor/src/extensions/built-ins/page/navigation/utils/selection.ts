import { findViewElements } from "../../../../../managers/events/document-view";
/**
 * Shared selection and focus operations for page navigation registrations.
 *
 * @module
 */
import {
  assertBlockRangeEndpoints,
  createCaretSelection,
  type EditorPosition,
  type RivtoEditorApi,
  type Selection,
} from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  PAGE_EDITOR_ROOT_SELECTOR,
} from "../../../../../constants";
import type { EditorViewApi } from "../../../../../editor-view/types";
import { focusBlock, resolveSelectionEndpoints } from "../../../../../managers";
import type { ViewSelectionApi } from "../../../../../managers/selection/api";
import { getPageVirtualizationControllerForElement } from "../../../../../surfaces/page/page-virtualization-controller";
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
  selectionManager: ViewSelectionApi,
): Selection | undefined {
  return selectionManager.readDOM() ?? selectionManager.get();
}

/**
 * Publishes and focuses one caret position.
 *
 * @param root - Active editor root.
 * @param editorView - Owning editor view.
 * @param position - Target portable position.
 * @returns No value.
 */
export function setNavigationCaret(
  root: HTMLElement,
  editorView: EditorViewApi,
  position: EditorPosition,
): void {
  editorView.selection.set(createCaretSelection(position.blockId, position.offset));
  focusBlock(root, position.blockId, position.offset);
}

/**
 * Resolves the document-order edge of a text selection.
 *
 * @param editorView - Owning editor view.
 * @param editor - Core editor API.
 * @param selection - Text-like portable selection.
 * @param edge - Requested logical edge.
 * @returns Position at that edge.
 */
export function textSelectionEdge(
  editorView: EditorViewApi,
  editor: EditorViewApi | RivtoEditorApi,
  selection: Selection,
  edge: "start" | "end",
): EditorPosition {
  const documentEditor = "runtime" in editor ? editor.runtime : editor;
  assertBlockRangeEndpoints(selection);
  const lengthOf = (id: string) => documentEditor.blocks.getBlockNode(id)?.content.length ?? 0;
  const ends = resolveSelectionEndpoints(selection, lengthOf);
  if (!ends) return { blockId: selection.focusBlockId, offset: 0 };
  const ids = pageEntries(
    navigationOutlineBlocks(editor, selection.focusBlockId),
    null,
    false,
    (block) => !editorView.runtime.blockListProps.childrenVisible(block),
  ).map(({ block }) => block.id);
  const anchorIndex = ids.indexOf(ends.anchor.blockId);
  const headIndex = ids.indexOf(ends.head.blockId);
  const forward = anchorIndex < headIndex || (
    anchorIndex === headIndex && ends.anchor.offset <= ends.head.offset
  );
  const start = forward ? ends.anchor : ends.head;
  const stop = forward ? ends.head : ends.anchor;
  return edge === "start" ? start : stop;
}

/**
 * Moves a boundary caret to the adjacent page editor in DOM order.
 *
 * @param root - Active editor root.
 * @param direction - Adjacent editor direction.
 * @returns Whether another editor accepted focus.
 */
export function focusAdjacentEditor(root: HTMLElement, direction: VerticalDirection): boolean {
  // A subtree editor is contained by another page, not the next journal page.
  const roots = Array.from(root.ownerDocument.querySelectorAll<HTMLElement>(PAGE_EDITOR_ROOT_SELECTOR))
    .filter((candidate) => !candidate.parentElement?.closest(PAGE_EDITOR_ROOT_SELECTOR));
  const index = roots.indexOf(root);
  if (index < 0) return false;
  const adjacent = roots[index + (direction === "up" ? -1 : 1)];
  if (!adjacent) return false;
  getPageVirtualizationControllerForElement(adjacent)?.mountFirstOrLastBlock(direction === "up" ? -1 : 1);
  const blocks = findViewElements(adjacent, BLOCK_ID_SELECTOR);
  if (direction === "up") blocks.reverse();
  let focused = false;
  for (const block of blocks) {
    const content = Array.from(block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR))
      .find((candidate) => candidate.closest(BLOCK_ID_SELECTOR) === block);
    const blockId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (blockId && content) {
      focused = focusBlock(adjacent, blockId, direction === "up" ? content.textContent?.length ?? 0 : 0);
      break;
    }
  }
  return focused;
}

/**
 * Focuses one structural block selection without creating a DOM range.
 *
 * @param root - Active editor root.
 * @param blockId - Focus block identifier.
 * @returns No value.
 */
export function focusBlockSelection(root: HTMLElement, blockId: string): void {
  getPageVirtualizationControllerForElement(root)?.mountBlocks([blockId]);
  root.ownerDocument.getSelection()?.removeAllRanges();
  root.focus({ preventScroll: true });
  root.querySelector<HTMLElement>(`[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(blockId)}"]`)
    ?.scrollIntoView({ block: "nearest" });
}
