import type { EditorBlock } from "@chulane/rivto";
import { validateBlockForest, type BlockDestination } from "@chulane/document-model";

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
  const destinationPosition = resolveTransferDestination(destinationInput, placement);
  if (source.getDocument() === destination.getDocument()) {
    throw new Error("Cross-document transfer requires different documents");
  }

  // Read the complete source forest before inspecting identity conflicts. A missing
  // source or a collision anywhere in its descendants must fail before either write.
  const roots = rootIds.map((id): EditorBlock => {
    const root = source.blocks.getBlock(id);
    if (!root) {
      throw new Error(`Source block ${id} does not exist`);
    }
    return root;
  });
  for (const id of validateBlockForest(roots, { requireComplete: true })) {
    if (destination.blocks.hasBlock(id)) {
      throw new Error(`Destination already contains block ${id}`);
    }
  }

  // Import runs destination preparation and entry rules before source removal.
  // If the source intercepts removal, the successfully inserted copy remains.
  if (!destination.blocks.canMove({ sources: roots, destination: destinationPosition })) {
    throw new Error("Block transfer is not permitted at this destination");
  }
  destination.blocks.importForest(roots, destinationPosition, { preserveIds: true });
  if (!source.blocks.removeBlocks(rootIds)) {
    throw new Error("Source block removal was intercepted after destination insertion");
  }
}

/**
 * Translates a panel-relative drop anchor into the receiving document's hierarchy.
 *
 * The hidden panel root may receive children. Placing a sibling beside it would
 * escape the displayed subtree, so sibling anchors must be accessible and removable.
 *
 * @param destinationInput - Document or bounded panel receiving the roots.
 * @param placement - Target block and relationship requested by the drag.
 * @returns Document-relative parent and optional following sibling.
 * @throws If the target is missing, protected or outside the receiving panel.
 */
function resolveTransferDestination(
  destinationInput: BlockTransferInput,
  placement: CrossDocumentBlockTransferPlacement,
): BlockDestination {
  const { targetId, position } = placement;
  const panel = "document" in destinationInput ? destinationInput : undefined;
  if (targetId === null) {
    // Empty surfaces append to their displayed root.
    return { parentId: panel?.rootBlockId ?? null };
  }
  if (panel && !(position === "inside" && targetId === panel.rootBlockId)) {
    if (
      !panel.blocks.hasBlock(targetId) ||
      (position !== "inside" && !panel.blocks.canRemove(targetId))
    ) {
      throw new Error("Destination is outside panel or protected");
    }
  }
  const document = "document" in destinationInput ? destinationInput.document : destinationInput;
  if (!document.blocks.hasBlock(targetId)) {
    throw new Error(`Destination block ${targetId} does not exist`);
  }
  if (position === "inside") {
    // The selected block becomes the parent.
    return { parentId: targetId };
  }
  if (position === "before") {
    // Insertion uses the following sibling as its stable anchor.
    return { parentId: document.blocks.getParentId(targetId)!, beforeId: targetId };
  }
  return document.blocks.getInsertionDestinationAfter(targetId);
}
