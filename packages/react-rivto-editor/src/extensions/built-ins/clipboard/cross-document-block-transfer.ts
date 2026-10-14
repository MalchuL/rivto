import type { DocumentEditorAPI, EditorBlock, EditorBlockInput } from "@chulane/rivto";
import type { ReactPanelApi } from "../../../panels/types";
import type { BlockDestination } from "@chulane/document-model";

/** Document operations required by transfer; accepts core, runtime, and view editors. */
type BlockTransferEditor = Pick<DocumentEditorAPI, "blocks" | "history" | "getDocument">;

/** Destination used by a cross-document page drag. */
export interface CrossDocumentBlockTransferPlacement {
  /** Existing destination block, or null when appending roots to an empty page. */
  readonly targetId: string | null;
  /** Relationship to the destination block. Ignored when targetId is null. */
  readonly position: "before" | "after" | "inside";
}

/**
 * Collects every stable identifier in a detached subtree.
 * @param block - Subtree root to visit.
 * @param ids - Destination set receiving root and descendant identifiers.
 * @returns No value.
 */
function collectBlockIds(block: EditorBlockInput, ids: Set<string>): void {
  if (!block.id) {
    throw new Error("Transfer preparation must preserve block IDs");
  }
  ids.add(block.id);
  block.children?.forEach((child) => collectBlockIds(child, ids));
}

/**
 * Detaches one complete persisted subtree from its source editor snapshots.
 * @param block - Source subtree to clone.
 * @returns Lossless detached subtree retaining stable identifiers.
 */
function cloneBlock(block: EditorBlock): EditorBlock {
  return structuredClone(block);
}

/**
 * Builds the lossless payload and validates placement and identity conflicts.
 *
 * Complete destination preparation happens through `prepareInput` before its
 * first write, preventing an unavailable custom type from partially importing.
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
  if (placement.targetId !== null && !destination.blocks.hasBlock(placement.targetId!)) {
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

  return roots.map(cloneBlock);
}

/**
 * Moves complete selected subtrees between independent documents.
 *
 * The destination is committed first. Only a successful insertion permits the
 * source deletion, so validation and insertion failures never lose source data.
 * Each batch remains one undo item in its owning Yjs history.
 * @param source - Runtime supplying source snapshots and deletion commands.
 * @param destination - Different document-bound runtime supplying destination preparation and insertion commands.
 * @param rootIds - Source subtree identities to preserve during transfer.
 * @param placement - Destination block relationship.
 * @returns Nothing after insertion and source deletion.
 * @throws If the models match, IDs collide, a block is missing, or destination preparation/insertion fails.
 */
export function crossDocumentBlockTransfer(
  sourceInput: BlockTransferEditor | ReactPanelApi,
  destinationInput: BlockTransferEditor | ReactPanelApi,
  rootIds: readonly string[],
  placement: CrossDocumentBlockTransferPlacement,
): void {
  const source = "getDocument" in sourceInput ? sourceInput : sourceInput.document;
  const destination =
    "getDocument" in destinationInput ? destinationInput : destinationInput.document;
  const sourcePanel = "editor" in sourceInput ? sourceInput : undefined;
  const destinationPanel = "editor" in destinationInput ? destinationInput : undefined;
  if (sourcePanel && rootIds.some((id) => !sourcePanel.blocks.canRemove(id))) {
    throw new Error("Source block is outside panel or protected");
  }
  if (destinationPanel && placement.targetId !== null) {
    const container =
      placement.position === "inside" && placement.targetId === destinationPanel.rootBlockId;
    if (
      !container &&
      (!destinationPanel.blocks.hasBlock(placement.targetId) ||
        (placement.position !== "inside" && !destinationPanel.blocks.canRemove(placement.targetId)))
    ) {
      throw new Error("Destination is outside panel or protected");
    }
  }
  const destinationDocument = destination.getDocument();
  const blocks = getTransferBlocks(source, destination, rootIds, placement);
  const prepared = destination.blocks.prepareInput(blocks);
  const sourceIds = new Set<string>();
  const preparedIds = new Set<string>();
  blocks.forEach((block) => collectBlockIds(block, sourceIds));
  prepared.forEach((block) => collectBlockIds(block, preparedIds));
  if (sourceIds.size !== preparedIds.size || [...sourceIds].some((id) => !preparedIds.has(id))) {
    throw new Error("Transfer preparation must preserve block IDs");
  }
  let insertion = { parentId: destinationPanel?.rootBlockId ?? null } as BlockDestination;
  if (placement.targetId !== null) {
    if (placement.position === "inside") {
      insertion = { parentId: placement.targetId };
    } else if (placement.position === "before") {
      insertion = {
        parentId: destination.blocks.getParentId(placement.targetId)!,
        beforeId: placement.targetId,
      };
    } else {
      insertion = destination.blocks.getInsertionDestinationAfter(placement.targetId);
    }
  }
  destination.history.batchUpdates(() => {
    prepared.forEach((block) => destinationDocument.blocks.insertBlock(block, insertion));
  });
  source.history.batchUpdates(() => {
    rootIds.forEach((id) => source.blocks.removeBlock(id));
  });
}
