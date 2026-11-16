import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";
import type { BlockDestination } from "@chulane/document-model";

import type {
  BlockTransferEditor,
  BlockTransferInput,
  CrossDocumentBlockTransferPlacement,
} from "./types";

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
  const source = "getDocument" in sourceInput ? sourceInput : sourceInput.document;
  const destination =
    "getDocument" in destinationInput ? destinationInput : destinationInput.document;
  validatePanels(sourceInput, destinationInput, rootIds, placement);
  const blocks = getTransferBlocks(source, destination, rootIds, placement);
  const destinationPosition = getTransferDestination(destinationInput, destination, placement);
  if (!destination.blocks.canMove({ sources: blocks, destination: destinationPosition })) {
    throw new Error("Block transfer is not permitted at this destination");
  }
  destination.blocks.importForest(blocks, destinationPosition, { preserveIds: true });
  if (!source.blocks.removeBlocks(rootIds)) {
    throw new Error("Source block removal was intercepted after destination insertion");
  }
}

/**
 * Collects every stable identifier in a detached subtree.
 *
 * @param block - Subtree root to visit.
 * @param ids - Destination set receiving root and descendant identifiers.
 * @returns The set contains this subtree's stable identities.
 * @throws If preparation has omitted a required stable block ID.
 */
function collectBlockIds(block: EditorBlockInput, ids: Set<string>): void {
  if (!block.id) {
    throw new Error("Transfer preparation must preserve block IDs");
  }
  ids.add(block.id);
  block.children?.forEach((child) => collectBlockIds(child, ids));
}

/**
 * Builds the lossless payload and validates placement and identity conflicts.
 *
 * Complete destination preparation happens through the receiving block manager before its
 * first write, preventing an unavailable custom type from partially importing.
 *
 * @param source - Live document-bound source reads.
 * @param destination - Live destination reads used to reject identity collisions.
 * @param rootIds - Source roots in the requested transfer order.
 * @param placement - Current destination anchor or empty-document append.
 * @returns Detached recursive roots ready for complete destination preparation.
 * @throws If documents match, an anchor or source is missing, IDs collide, or cloning fails.
 */
function getTransferBlocks(
  source: BlockTransferEditor,
  destination: BlockTransferEditor,
  rootIds: readonly string[],
  placement: CrossDocumentBlockTransferPlacement,
): EditorBlock[] {
  if (source.getDocument() === destination.getDocument()) {
    throw new Error("Cross-document transfer requires different documents");
  }
  if (placement.targetId !== null && !destination.blocks.hasBlock(placement.targetId)) {
    throw new Error(`Destination block ${placement.targetId} does not exist`);
  }
  const roots = rootIds.map((id) => {
    const block = source.blocks.getBlock(id);
    if (!block) {
      throw new Error(`Source block ${id} does not exist`);
    }
    return block;
  });
  const blockIds = new Set<string>();
  roots.forEach((block) => collectBlockIds(block, blockIds));
  for (const id of blockIds) {
    if (destination.blocks.hasBlock(id)) {
      throw new Error(`Destination already contains block ${id}`);
    }
  }
  return roots.map((block) => structuredClone(block));
}

/**
 * Rejects inaccessible sources and destination anchors before payload preparation.
 *
 * A hidden panel root remains a valid inside container; it cannot be used as an
 * outside sibling anchor. Document-only callers have no additional panel boundary.
 *
 * @param source - Source document or panel whose removal boundary is checked.
 * @param destination - Receiving document or panel whose destination is checked.
 * @param rootIds - Complete requested group checked before the first write.
 * @param placement - Current destination relationship.
 * @returns All supplied panel access checks have passed.
 * @throws If a source or destination is outside its panel or protected.
 */
function validatePanels(
  source: BlockTransferInput,
  destination: BlockTransferInput,
  rootIds: readonly string[],
  placement: CrossDocumentBlockTransferPlacement,
): void {
  if (!("getDocument" in source) && rootIds.some((id) => !source.blocks.canRemove(id))) {
    throw new Error("Source block is outside panel or protected");
  }
  if (!("getDocument" in destination) && placement.targetId !== null) {
    const container =
      placement.position === "inside" && placement.targetId === destination.rootBlockId;
    if (
      !container &&
      (!destination.blocks.hasBlock(placement.targetId) ||
        (placement.position !== "inside" && !destination.blocks.canRemove(placement.targetId)))
    ) {
      throw new Error("Destination is outside panel or protected");
    }
  }
}

/**
 * Translates the current anchor into actual model hierarchy before insertion.
 *
 * @param destinationInput - Receiving document or panel supplying the root boundary.
 * @param destination - Live destination commands used for sibling placement.
 * @param placement - Existing target relationship or append without an anchor.
 * @returns Actual parent and optional next sibling, bounded to a hidden panel root when present.
 * @throws Delegated hierarchy read failures for unavailable sibling anchors.
 */
function getTransferDestination(
  destinationInput: BlockTransferInput,
  destination: BlockTransferEditor,
  placement: CrossDocumentBlockTransferPlacement,
): BlockDestination {
  if (placement.targetId === null) {
    const parentId =
      "getDocument" in destinationInput ? null : (destinationInput.rootBlockId ?? null);
    return { parentId };
  }
  if (placement.position === "inside") {
    return { parentId: placement.targetId };
  }
  if (placement.position === "before") {
    return {
      parentId: destination.blocks.getParentId(placement.targetId)!,
      beforeId: placement.targetId,
    };
  }
  return destination.blocks.getInsertionDestinationAfter(placement.targetId);
}
