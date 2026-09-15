import { createRivtoEditor, type EditorRuntime } from "./rivto-editor";
import type { CreateRivtoEditorOptions } from "./types";
import type { EditorPosition } from "../managers/selection-manager";
import { createCaretSelection, createTextSelection, createStructuralSelection } from "../managers/selection-manager";
import type { Block } from "@chulane/document-model";

/**
 * Core test editor with a local writing block registered.
 *
 * Production hosts / React extensions own writing types; core no longer
 * auto-installs `paragraph`.
 */
export function createTestEditor(options: CreateRivtoEditorOptions = {}): EditorRuntime {
  const editor = createRivtoEditor(options);
  editor.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
  return editor;
}

/**
 * Flattens current document blocks with live UTF-16 lengths.
 * @param editor - Runtime providing the document forest.
 * @returns Ordered `{ id, length }` rows for {@link createTextSelection}.
 */
function orderedLengths(editor: EditorRuntime): { id: string; length: number }[] {
  const ordered: { id: string; length: number }[] = [];
  const visit = (blocks: Block[]): void => blocks.forEach((block) => {
    ordered.push({ id: block.id, length: block.content.length });
    visit(block.children);
  });
  visit(editor.blocks.getBlocks());
  return ordered;
}

/**
 * Builds a caret selection.
 * @param blockId - Caret block.
 * @param offset - UTF-16 caret offset.
 * @returns Canonical one-block empty coverage.
 */
export function testCaret(blockId: string, offset: number) {
  return createCaretSelection(blockId, offset);
}

/**
 * Builds per-block coverage from two directed endpoints against live lengths.
 * @param editor - Runtime providing document order.
 * @param anchor - Gesture start.
 * @param head - Gesture head.
 * @returns Canonical block selection.
 */
export function testRange(editor: EditorRuntime, anchor: EditorPosition, head: EditorPosition) {
  const item = createTextSelection(orderedLengths(editor), anchor, head);
  if (!item) throw new Error("testRange: endpoint block not found");
  return item;
}

export { createStructuralSelection };
