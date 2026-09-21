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
import type { ReactEditor } from "../../types";
import { getBlockContainment } from "../../managers/blocks/types";

/**
 * Reads the outline policy of a placed block's parent.
 *
 * @param reactEditor - Runtime owning the block definitions.
 * @param id - Child whose current parent supplies the policy.
 * @returns Parent containment, or `undefined` at the root or without metadata.
 */
function parentContainment(reactEditor: ReactEditor, id: string) {
  const parentId = reactEditor.blocks.getParentId(id);
  const parentType = parentId ? reactEditor.blocks.getBlockNode(parentId)?.type : undefined;
  return parentType ? getBlockContainment(reactEditor.blockTypes.getDefinition(parentType)) : undefined;
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
  reactEditor.blocks.indentBlocks([...ids]);
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
  reactEditor.blocks.outdentBlocks([...ids]);
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
  let parentId = reactEditor.blocks.getParentId(id);
  while (parentId) {
    outdentBlocks(reactEditor, [id]);
    const next = reactEditor.blocks.getParentId(id);
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
 * @returns Complete inserted writing block.
 */
export function insertFirstChild(reactEditor: ReactEditor, parentId: string): EditorBlock {
  let child: EditorBlock | undefined;
  reactEditor.history.batchUpdates(() => {
    reactEditor.blocks.updateBlock(parentId, { listProps: { collapsed: false } });
    child = reactEditor.blocks.insertBlock(reactEditor.createDefaultBlock());
    reactEditor.blocks.moveBlocks([child.id], parentId, "inside");
    reactEditor.selection.set(createCaretSelection(child.id, 0));
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
  const block = reactEditor.blocks.getBlockNode(blockId);
  if (!block || reactEditor.blocks.hasChildren(blockId)) return;
  reactEditor.history.batchUpdates(() => {
    const templateId = reactEditor.blocks.insertBlock(input, blockId).id;
    const childIds = reactEditor.blocks.getBlockNode(templateId)?.childIds ?? [];
    reactEditor.blocks.setBlockType(blockId, input.type);
    if (childIds.length) reactEditor.blocks.moveBlocks(childIds, blockId, "inside");
    reactEditor.blocks.removeBlock(templateId);
  });
}
