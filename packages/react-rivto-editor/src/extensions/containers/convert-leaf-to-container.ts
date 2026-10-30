import type { EditorBlockInput } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";

/**
 * Converts an existing leaf block into a container while preserving its ID and text.
 *
 * Used primarily by slash commands that turn a leaf into Columns, Kanban, or a
 * Table. The original block remains in the document, and its text stays stored
 * even when the destination container's renderer does not display that text.
 *
 * Changing the type alone does not create the container's initial children;
 * inserting a container alone creates another block instead of converting the
 * original. This helper combines the existing operations in one history batch:
 * 1. Inserts a temporary container from `input`, including its initial subtree,
 *    after the original block. If the original cannot be removed, such as a
 *    protected panel root, the temporary container is inserted inside it.
 * 2. Changes the original block's type using the normal type-change behavior.
 * 3. Moves the temporary container's children into the original block.
 * 4. Removes the temporary container, leaving the original ID as the root.
 *
 * Only the destination type and child subtree are transferred from `input`.
 * Its root ID, content, and props are not copied into the original block;
 * the normal type change prepares the original block's props. The temporary
 * parent reuses subtree insertion rather than satisfying a core hierarchy
 * restriction; it is an implementation choice, not a conversion requirement.
 *
 * The batch groups these mutations into one undo step. It does not roll back
 * mutations if a delegated operation throws. Missing blocks and blocks that
 * already have children are left unchanged.
 *
 * @param reactPanel - Panel API providing hierarchy operations and history batching.
 * @param blockId - ID of the existing leaf to convert without replacing it.
 * @param input - Container input supplying the destination type and initial child subtree.
 * @returns Leaves the original block converted with its initial children, or makes no changes when it is missing or already has children.
 * @throws If a delegated hierarchy read, insertion, type change, move, or removal fails.
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
