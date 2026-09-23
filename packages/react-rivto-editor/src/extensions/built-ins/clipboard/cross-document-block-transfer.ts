import type {
  EditorBlock,
  RivtoEditorApi,
} from "@chulane/rivto";
import type { ReactEditor } from "../../../types";

/** Destination used by a cross-document page drag. */
export interface CrossDocumentBlockTransferPlacement {
  /** Existing destination block, or null when appending roots to an empty page. */
  readonly targetId: string | null;
  /** Relationship to the destination block. Ignored when targetId is null. */
  readonly position: "before" | "after" | "inside";
}

/** Complete data transported between two independent editor documents. */
interface CrossDocumentBlockTransferBundle {
  readonly blocks: readonly EditorBlock[];
}

/**
 * Collects every stable identifier in a detached subtree.
 * @param block - Subtree root to visit.
 * @param ids - Destination set receiving root and descendant identifiers.
 * @returns No value.
 */
function collectBlockIds(block: EditorBlock, ids: Set<string>): void {
  ids.add(block.id);
  block.children.forEach((child) => collectBlockIds(child, ids));
}

/**
 * Detaches one complete persisted subtree from its source editor snapshots.
 * @param block - Source subtree to clone.
 * @returns Lossless detached subtree retaining stable identifiers.
 */
function cloneBlock(block: EditorBlock): EditorBlock {
  return {
    ...block,
    listProps: structuredClone(block.listProps),
    props: structuredClone(block.props),
    pluginData: structuredClone(block.pluginData),
    children: block.children.map(cloneBlock),
  };
}

/**
 * Builds the lossless payload and validates placement and identity conflicts.
 *
 * Complete destination preparation happens inside `importForest` before its
 * first write, preventing an unavailable custom type from partially importing.
 */
function createCrossDocumentBlockTransferBundle(
  source: ReactEditor | RivtoEditorApi,
  destination: ReactEditor | RivtoEditorApi,
  rootIds: readonly string[],
  placement: CrossDocumentBlockTransferPlacement,
): CrossDocumentBlockTransferBundle {
  if (source === destination) throw new Error("Cross-document transfer requires different editors");
  if (placement.targetId !== null && !destination.blocks.hasBlock(placement.targetId)) {
    throw new Error(`Destination block ${placement.targetId} does not exist`);
  }

  const roots = rootIds.map((id) => {
    const block = source.blocks.getBlock(id);
    if (!block) throw new Error(`Source block ${id} does not exist`);
    return block;
  });
  const blockIds = new Set<string>();
  roots.forEach((block) => collectBlockIds(block, blockIds));
  for (const id of blockIds) {
    if (destination.blocks.hasBlock(id)) throw new Error(`Destination already contains block ${id}`);
  }

  return {
    blocks: roots.map(cloneBlock),
  };
}

/**
 * Moves complete selected subtrees between independent documents.
 *
 * The destination is committed first. Only a successful insertion permits the
 * source deletion, so validation and insertion failures never lose source data.
 * Each batch remains one undo item in its owning Yjs history.
 */
export function crossDocumentBlockTransfer(
  source: ReactEditor | RivtoEditorApi,
  destination: ReactEditor | RivtoEditorApi,
  rootIds: readonly string[],
  placement: CrossDocumentBlockTransferPlacement,
): void {
  const bundle = createCrossDocumentBlockTransferBundle(source, destination, rootIds, placement);
  destination.history.batchUpdates(() => {
    const insertedIds = destination.blocks.importForest(bundle.blocks).roots.map(({ id }) => id);
    if (placement.targetId !== null) {
      destination.blocks.moveBlocks(insertedIds, placement.targetId, placement.position);
    }
  });
  source.history.batchUpdates(() => {
    rootIds.forEach((id) => source.blocks.removeBlock(id));
  });
}
