/**
 * Outline primitives used by block views.
 *
 * Views call these instead of internal document storage so indent, outdent, and child
 * insertion share one implementation. React definition metadata applies
 * interaction policy before generic core commands run.
 *
 * @module
 */
import { createCaretSelection } from "@chulane/rivto";
import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";
import type { EditorViewApi } from "../../types";
import { getBlockContainment } from "../../managers/blocks/types";

/**
 * Reads the outline policy of a placed block's parent.
 *
 * @param editorView - Editor view owning the block definitions.
 * @param id - Child whose current parent supplies the policy.
 * @returns Parent containment, or `undefined` at the root or without metadata.
 */
function parentContainment(editorView: EditorViewApi, id: string) {
  const parentId = editorView.blocks.getParentId(id);
  const parentType = parentId ? editorView.blocks.getBlockNode(parentId)?.type : undefined;
  return parentType ? getBlockContainment(editorView.blockTypes.getDefinition(parentType)) : undefined;
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
  editorView.blocks.indentBlocks([...ids]);
}

/**
 * Lifts consecutive outline roots to their grandparent.
 *
 * @param editorView - Editor view owning React outline policy and core commands.
 * @param ids - Identifiers to outdent together.
 * @returns Nothing; a floor, fixed parent, or root range is unchanged.
 */
export function outdentBlocks(editorView: EditorViewApi, ids: readonly string[]): void {
  if (!ids.length) return;
  const containment = parentContainment(editorView, ids[0]!);
  if (containment?.childOutline === "fixed" || containment?.outlineFloor) return;
  editorView.blocks.outdentBlocks([...ids]);
}

/**
 * Outdents one block until it is a root or a floor refuses the next lift.
 *
 * The loop must stop when `outdentBlock` is a no-op. Otherwise a floor would
 * leave the parent unchanged and spin forever.
 *
 * @param editorView - Editor view owning React outline policy and core commands.
 * @param id - Nested block to lift.
 * @returns Nothing; the block stays at the last successful depth.
 */
export function outdentUntilBoundary(editorView: EditorViewApi, id: string): void {
  let parentId = editorView.blocks.getParentId(id);
  while (parentId) {
    outdentBlocks(editorView, [id]);
    const next = editorView.blocks.getParentId(id);
    if (next === parentId) break;
    parentId = next;
  }
}

/**
 * Inserts a default writing block as the last child of a container.
 *
 * Insertion parks the block on the document root, then moves it inside.
 * Creating it at the root avoids depending on a container's outline policy.
 *
 * @param editorView - Editor view providing writing factories and selection.
 * @param parentId - Container that receives the new child.
 * @returns Complete inserted writing block.
 */
export function insertFirstChild(editorView: EditorViewApi, parentId: string): EditorBlock {
  let child: EditorBlock | undefined;
  editorView.history.batchUpdates(() => {
    editorView.blocks.updateBlock(parentId, { listProps: { collapsed: false } });
    child = editorView.blocks.insertBlock(editorView.createDefaultBlock());
    editorView.blocks.moveBlocks([child.id], parentId, "inside");
    editorView.selection.set(createCaretSelection(child.id, 0));
  });
  return child!;
}

/**
 * Converts a leaf block in place and attaches a container's initial children.
 *
 * The root keeps its identity and dormant text, matching ordinary slash type
 * conversion. A temporary valid subtree supplies restricted structural children
 * before its disposable outer shell is removed in the same transaction.
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
  const block = editorView.blocks.getBlockNode(blockId);
  if (!block || editorView.blocks.hasChildren(blockId)) return;
  editorView.history.batchUpdates(() => {
    const templateId = editorView.blocks.insertBlock(input, blockId).id;
    const childIds = editorView.blocks.getBlockNode(templateId)?.childIds ?? [];
    editorView.blocks.setBlockType(blockId, input.type);
    if (childIds.length) editorView.blocks.moveBlocks(childIds, blockId, "inside");
    editorView.blocks.removeBlock(templateId);
  });
}
