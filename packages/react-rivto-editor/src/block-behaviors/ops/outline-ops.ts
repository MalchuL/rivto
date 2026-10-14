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
import type { ReactPanelApi } from "../../panels/types";
import { getBlockContainment } from "../../managers/blocks/types";

/**
 * Reads the outline policy of a placed block's parent.
 *
 * @param reactPanel - Editor view owning the block definitions.
 * @param id - Child whose current parent supplies the policy.
 * @returns Parent containment, or `undefined` at the root or without metadata.
 */
function parentContainment(reactPanel: ReactPanelApi, id: string) {
  const parentId = reactPanel.blocks.getParentId(id);
  const parentType = parentId ? reactPanel.blocks.getBlockNode(parentId)?.type : undefined;
  return parentType
    ? getBlockContainment(reactPanel.editor.blockTypes.getDefinition(parentType))
    : undefined;
}

/**
 * Nests consecutive outline roots under their previous sibling.
 *
 * @param reactPanel - Editor view owning React outline policy and core commands.
 * @param ids - Identifiers to indent together.
 * @returns Nothing; an ineligible range is unchanged.
 */
export function indentBlocks(reactPanel: ReactPanelApi, ids: readonly string[]): void {
  if (
    !ids.length ||
    ids.some((id) => !reactPanel.blocks.canRemove(id)) ||
    parentContainment(reactPanel, ids[0]!)?.childOutline === "fixed"
  ) {
    return;
  }
  reactPanel.blocks.indentBlocks([...ids]);
}

/**
 * Lifts consecutive outline roots to their grandparent.
 *
 * @param reactPanel - Editor view owning React outline policy and core commands.
 * @param ids - Identifiers to outdent together.
 * @returns Nothing; root blocks and children of parents with outlineFloor or
 * childOutline: "fixed" remain unchanged.
 */
export function outdentBlocks(reactPanel: ReactPanelApi, ids: readonly string[]): void {
  if (!ids.length || ids.some((id) => !reactPanel.blocks.canOutdent(id))) {
    return;
  }
  const containment = parentContainment(reactPanel, ids[0]!);
  if (containment?.childOutline === "fixed" || containment?.outlineFloor) {
    return;
  }
  reactPanel.blocks.outdentBlocks([...ids]);
}

/**
 * Outdents one block until it reaches the document root or its parent forbids outdenting.
 *
 * The loop must stop when outdentBlocks() leaves the parent unchanged. A parent
 * with outlineFloor or fixed children can refuse the move; retrying would loop forever.
 *
 * @param reactPanel - Editor view owning React outline policy and core commands.
 * @param id - Nested block to lift.
 * @returns Nothing; the block stays at the last successful depth.
 */
export function outdentUntilBoundary(reactPanel: ReactPanelApi, id: string): void {
  let parentId = reactPanel.blocks.getParentId(id);
  while (parentId) {
    outdentBlocks(reactPanel, [id]);
    const next = reactPanel.blocks.getParentId(id);
    if (next === parentId) {
      break;
    }
    parentId = next;
  }
}

/**
 * Inserts a default writing block as the last child of a container.
 *
 * Insertion validates the local parent and creates the block directly inside the container.
 * No temporary document-root placement is observable during creation.
 * The same history batch expands the parent and sets model selection to the new
 * child at offset zero. The caller schedules DOM focus after rendering.
 *
 * @param reactPanel - Editor view providing writing factories and selection.
 * @param parentId - Container that receives the new child.
 * @returns Complete inserted writing block.
 */
export function appendWritingBlock(reactPanel: ReactPanelApi, parentId: string): EditorBlock {
  let child: EditorBlock | undefined;
  reactPanel.batchUpdates(() => {
    reactPanel.blocks.updateBlock(parentId, { listProps: { collapsed: false } });
    child = reactPanel.blocks.insertBlock(reactPanel.editor.createDefaultBlock(), { parentId });
    reactPanel.selection.set(createCaretSelection(child.id, 0));
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
 * @param reactPanel - Editor view owning block definitions and mutations.
 * @param blockId - Existing leaf block whose native type changes.
 * @param input - Destination container input supplying its type and children.
 * @returns Nothing; missing or non-leaf blocks remain unchanged.
 */
export function convertLeafToContainer(
  reactPanel: ReactPanelApi,
  blockId: string,
  input: EditorBlockInput,
): void {
  const block = reactPanel.blocks.getBlockNode(blockId);
  if (!block || reactPanel.blocks.hasChildren(blockId)) {
    return;
  }
  reactPanel.batchUpdates(() => {
    const destination = reactPanel.blocks.canRemove(blockId)
      ? reactPanel.blocks.getInsertionDestinationAfter(blockId)
      : { parentId: blockId };
    const templateId = reactPanel.blocks.insertBlock(input, destination).id;
    const childIds = reactPanel.blocks.getBlockNode(templateId)?.childIds ?? [];
    reactPanel.blocks.setBlockType(blockId, input.type);
    if (childIds.length) {
      reactPanel.blocks.moveBlocks([...childIds], blockId, "inside");
    }
    reactPanel.blocks.removeBlock(templateId);
  });
}
