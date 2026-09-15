/**
 * Outline primitives used by block views.
 *
 * Views call these instead of `editor.document` so indent, outdent, and child
 * insertion share one implementation. React definition metadata applies
 * interaction policy before generic core commands run.
 *
 * @module
 */
import { createCaretSelection } from "@chulane/rivto";
import type { EditorBlockInput } from "@chulane/rivto";
import type { ReactEditor } from "../../types";
import { getBlockContainment } from "../../managers/blocks/block-types";

/**
 * Reads the outline policy of a placed block's parent.
 *
 * @param reactEditor - Runtime owning the block definitions.
 * @param id - Child whose current parent supplies the policy.
 * @returns Parent containment, or `undefined` at the root or without metadata.
 */
function parentContainment(reactEditor: ReactEditor, id: string) {
  const { editor } = reactEditor;
  const parentId = editor.blocks.getParentId(id);
  const parentType = parentId ? editor.blocks.getBlock(parentId)?.type : undefined;
  return parentType ? getBlockContainment(editor.blocksRegistry.get(parentType)) : undefined;
}

/**
 * Nests consecutive outline roots under their previous sibling.
 *
 * @param reactEditor - Runtime owning React outline policy and core commands.
 * @param ids - Identifiers to indent together.
 * @returns Nothing; an ineligible range is unchanged.
 */
export function indentBlocks(reactEditor: ReactEditor, ids: readonly string[]): void {
  if (!ids.length || parentContainment(reactEditor, ids[0]!)?.childOutline === "fixed") return;
  reactEditor.editor.blocks.indentBlocks([...ids]);
}

/**
 * Lifts consecutive outline roots to their grandparent.
 *
 * @param reactEditor - Runtime owning React outline policy and core commands.
 * @param ids - Identifiers to outdent together.
 * @returns Nothing; a floor, fixed parent, or root range is unchanged.
 */
export function outdentBlocks(reactEditor: ReactEditor, ids: readonly string[]): void {
  if (!ids.length) return;
  const containment = parentContainment(reactEditor, ids[0]!);
  if (containment?.childOutline === "fixed" || containment?.outlineFloor) return;
  reactEditor.editor.blocks.outdentBlocks([...ids]);
}

/**
 * Outdents one block until it is a root or a floor refuses the next lift.
 *
 * The loop must stop when `outdentBlock` is a no-op. Otherwise a floor would
 * leave the parent unchanged and spin forever.
 *
 * @param reactEditor - Runtime owning React outline policy and core commands.
 * @param id - Nested block to lift.
 * @returns Nothing; the block stays at the last successful depth.
 */
export function outdentUntilBoundary(reactEditor: ReactEditor, id: string): void {
  const { editor } = reactEditor;
  let parentId = editor.blocks.getParentId(id);
  while (parentId) {
    outdentBlocks(reactEditor, [id]);
    const next = editor.blocks.getParentId(id);
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
 * @param reactEditor - Runtime providing writing factories and selection.
 * @param parentId - Container that receives the new child.
 * @returns Identifier of the inserted writing block.
 */
export function insertFirstChild(reactEditor: ReactEditor, parentId: string): string {
  const { editor } = reactEditor;
  let childId = "";
  editor.batchUpdates(() => {
    reactEditor.blocks.updateBlock(parentId, { listProps: { collapsed: false } });
    childId = reactEditor.blocks.insertBlock(reactEditor.createDefaultBlock());
    editor.blocks.moveBlocks([childId], parentId, "inside");
    reactEditor.selection.set(createCaretSelection(childId, 0));
  });
  return childId;
}

/**
 * Converts a leaf block in place and attaches a container's initial children.
 *
 * The root keeps its identity and dormant text, matching ordinary slash type
 * conversion. A temporary valid subtree supplies restricted structural children
 * before its disposable outer shell is removed in the same transaction.
 *
 * @param reactEditor - Runtime owning block definitions and mutations.
 * @param blockId - Existing leaf block whose native type changes.
 * @param input - Destination container input supplying its type and children.
 * @returns Nothing; missing or non-leaf blocks remain unchanged.
 */
export function convertLeafToContainer(
  reactEditor: ReactEditor,
  blockId: string,
  input: EditorBlockInput,
): void {
  const { editor } = reactEditor;
  const block = editor.blocks.getBlock(blockId);
  if (!block || block.children.length) return;
  editor.batchUpdates(() => {
    const templateId = reactEditor.blocks.insertBlock(input, blockId);
    const childIds = editor.blocks.getBlock(templateId)?.children.map((child) => child.id) ?? [];
    editor.blocks.setBlockType(blockId, input.type);
    if (childIds.length) editor.blocks.moveBlocks(childIds, blockId, "inside");
    editor.blocks.removeBlock(templateId);
  });
}
