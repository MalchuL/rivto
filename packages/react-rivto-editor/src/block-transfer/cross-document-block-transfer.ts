import type { EditorBlock } from "@chulane/rivto";
import type { BlockDestination } from "@chulane/document-model";

import type { BlockTransferInput, CrossDocumentBlockTransferPlacement } from "./types";

/**
 * Moves complete selected subtrees between independent documents.
 *
 * The destination is committed first. Only a successful insertion permits the
 * source deletion, so validation and insertion failures never lose source data.
 * Each batch remains one undo item in its owning history. Import runs entry
 * rules before removal runs exit rules, so exit transformations do not reach the
 * imported blocks. Removal can be intercepted after insertion, leaving a copy.
 * Panel inputs apply their own access boundaries; neither input's lifecycle is acquired.
 *
 * @param sourceInput - Source document or panel supplying selected blocks.
 * @param destinationInput - Different destination document or panel.
 * @param rootIds - Source subtree identities to preserve during transfer.
 * @param placement - Destination block relationship.
 * @returns After insertion and source deletion complete in their owning histories.
 * @throws If documents match, IDs collide, a block is missing, panel access fails,
 * or delegated preparation, insertion, or deletion fails. A failure or interception
 * during source removal can leave the destination copy in place.
 */
export function transferBlocksBetweenDocuments(
  sourceInput: BlockTransferInput,
  destinationInput: BlockTransferInput,
  rootIds: readonly string[],
  placement: CrossDocumentBlockTransferPlacement,
): void {
  const source = "document" in sourceInput ? sourceInput.document : sourceInput;
  const destination = "document" in destinationInput ? destinationInput.document : destinationInput;
  // A panel can move descendants of its hidden root. The root itself cannot
  // be removed or used as a sibling anchor outside the displayed subtree.
  if ("document" in sourceInput && rootIds.some((id) => !sourceInput.blocks.canRemove(id))) {
    throw new Error("Source block is outside panel or protected");
  }
  const { targetId, position } = placement;
  if ("document" in destinationInput && targetId !== null) {
    const intoPanelRoot = position === "inside" && targetId === destinationInput.rootBlockId;
    if (
      !intoPanelRoot &&
      (!destinationInput.blocks.hasBlock(targetId) ||
        (position !== "inside" && !destinationInput.blocks.canRemove(targetId)))
    ) {
      throw new Error("Destination is outside panel or protected");
    }
  }
  if (source.getDocument() === destination.getDocument()) {
    throw new Error("Cross-document transfer requires different documents");
  }
  if (targetId !== null && !destination.blocks.hasBlock(targetId)) {
    throw new Error(`Destination block ${targetId} does not exist`);
  }

  // Read the complete source forest before inspecting identity conflicts. A missing
  // source or a collision anywhere in its descendants must fail before either write.
  const roots: EditorBlock[] = [];
  for (const id of rootIds) {
    const root = source.blocks.getBlock(id);
    if (!root) {
      throw new Error(`Source block ${id} does not exist`);
    }
    roots.push(root);
  }
  const pending = [...roots].reverse();
  const blockIds = new Set<string>();
  while (pending.length) {
    const block = pending.pop()!;
    if (!block.id) {
      throw new Error("Transfer preparation must preserve block IDs");
    }
    blockIds.add(block.id);
    for (let i = block.children.length - 1; i >= 0; i--) {
      pending.push(block.children[i]!);
    }
  }
  for (const id of blockIds) {
    if (destination.blocks.hasBlock(id)) {
      throw new Error(`Destination already contains block ${id}`);
    }
  }
  const blocks = roots.map((root) => structuredClone(root));

  // Translate the panel-relative anchor into the receiving document's coordinates.
  let destinationPosition: BlockDestination;
  if (targetId === null) {
    const parentId = "document" in destinationInput ? (destinationInput.rootBlockId ?? null) : null;
    destinationPosition = { parentId };
  } else if (position === "inside") {
    destinationPosition = { parentId: targetId };
  } else if (position === "before") {
    destinationPosition = {
      parentId: destination.blocks.getParentId(targetId)!,
      beforeId: targetId,
    };
  } else {
    destinationPosition = destination.blocks.getInsertionDestinationAfter(targetId);
  }
  // Import runs destination preparation and entry rules before source removal.
  // If the source intercepts removal, the successfully inserted copy remains.
  if (!destination.blocks.canMove({ sources: blocks, destination: destinationPosition })) {
    throw new Error("Block transfer is not permitted at this destination");
  }
  destination.blocks.importForest(blocks, destinationPosition, { preserveIds: true });
  if (!source.blocks.removeBlocks(rootIds)) {
    throw new Error("Source block removal was intercepted after destination insertion");
  }
}
