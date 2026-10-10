/**
 * Outline primitives used by block behaviors.
 *
 * Behaviors call these instead of internal document storage so indent, outdent, and child
 * insertion share one implementation. React definition metadata applies
 * interaction policy before generic core commands run.
 *
 * @module
 */
import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";
import { createCaretSelection } from "@chulane/rivto";
import type { EditorViewApi } from "../../editor-view/types";
import { getBlockContainment } from "../../managers/blocks/types";

/**
 * Reads the outline policy of a placed block's parent.
 *
 * @param editorView - Editor view owning the block definitions.
 * @param id - Child whose current parent supplies the policy.
 * @returns Parent containment, or `undefined` at the root or without metadata.
 */
function parentContainment(editorView: EditorViewApi, id: string) {
  const parentId = editorView.runtime.blocks.getParentId(id);
  const parentType = parentId ? editorView.runtime.blocks.getBlockNode(parentId)?.type : undefined;
  return parentType ? getBlockContainment(editorView.runtime.blockTypes.getDefinition(parentType)) : undefined;
}

/**
 * Nests consecutive outline roots under their previous sibling.
 *
 * @param editorView - Editor view owning React outline policy and core commands.
 * @param ids - Identifiers to indent together.
 * @returns Nothing; an ineligible range is unchanged.
 */
export function indentBlocks(editorView: EditorViewApi, ids: readonly string[]): void {
  if (!ids.length || parentContainment(editorView, ids[0]!)?.childOutline === "fixed") return;
  editorView.runtime.blocks.indentBlocks([...ids]);
}

/**
 * Lifts consecutive outline roots to their grandparent.
 *
 * @param editorView - Editor view owning React outline policy and core commands.
 * @param ids - Identifiers to outdent together.
 * @returns Nothing; root blocks and children of parents with outlineFloor or
 * childOutline: "fixed" remain unchanged.
 */
export function outdentBlocks(editorView: EditorViewApi, ids: readonly string[]): void {
  if (!ids.length) return;
  const containment = parentContainment(editorView, ids[0]!);
  if (containment?.childOutline === "fixed" || containment?.outlineFloor) return;
  editorView.runtime.blocks.outdentBlocks([...ids]);
}

/**
 * Outdents one block until it reaches the document root or its parent forbids outdenting.
 *
 * The loop must stop when outdentBlocks() leaves the parent unchanged. A parent
 * with outlineFloor or fixed children can refuse the move; retrying would loop forever.
 *
 * @param editorView - Editor view owning React outline policy and core commands.
 * @param id - Nested block to lift.
 * @returns Nothing; the block stays at the last successful depth.
 */
export function outdentUntilBoundary(editorView: EditorViewApi, id: string): void {
  let parentId = editorView.runtime.blocks.getParentId(id);
  while (parentId) {
    outdentBlocks(editorView, [id]);
    const next = editorView.runtime.blocks.getParentId(id);
    if (next === parentId) break;
    parentId = next;
  }
}

/**
 * Inserts a default writing block as the last child of a container.
 *
 * Insertion first creates the block at the document root, then moves it into the container.
 * Creating it at the root avoids depending on a container's outline policy.
 * The same history batch expands the parent and sets model selection to the new
 * child at offset zero. The caller schedules DOM focus after rendering.
 *
 * @param editorView - Editor view providing writing factories and selection.
 * @param parentId - Container that receives the new child.
 * @returns Complete inserted writing block.
 */
export function appendWritingBlock(editorView: EditorViewApi, parentId: string): EditorBlock {
  let child: EditorBlock | undefined;
  editorView.runtime.history.batchUpdates(() => {
    editorView.runtime.blocks.updateBlock(parentId, { listProps: { collapsed: false } });
    child = editorView.runtime.blocks.insertBlock(editorView.runtime.createDefaultBlock());
    editorView.runtime.blocks.moveBlocks([child.id], parentId, "inside");
    editorView.selection.set(createCaretSelection(child.id, 0));
  });
  return child!;
}

/**
 * Converts a leaf block in place and attaches a container's initial children.
 *
 * The root keeps its identity and dormant text, matching ordinary slash type
 * conversion. A temporary valid subtree supplies restricted structural children
 * before the temporary parent block is removed in the same history batch.
 *
 * @param editorView - Editor view owning block definitions and mutations.
 * @param blockId - Existing leaf block whose native type changes.
 * @param input - Destination container input supplying its type and children.
 * @returns Nothing; missing or non-leaf blocks remain unchanged.
 */
export function convertLeafToContainer(
  editorView: EditorViewApi,
  blockId: string,
  input: EditorBlockInput,
): void {
  const block = editorView.runtime.blocks.getBlockNode(blockId);
  if (!block || editorView.runtime.blocks.hasChildren(blockId)) return;
  editorView.runtime.history.batchUpdates(() => {
    const templateId = editorView.runtime.blocks.insertBlock(input, blockId).id;
    const childIds = editorView.runtime.blocks.getBlockNode(templateId)?.childIds ?? [];
    editorView.runtime.blocks.setBlockType(blockId, input.type);
    if (childIds.length) editorView.runtime.blocks.moveBlocks(childIds, blockId, "inside");
    editorView.runtime.blocks.removeBlock(templateId);
  });
}
