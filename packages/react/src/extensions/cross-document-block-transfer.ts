import type {
  EditorBlock,
  EditorBlockInput,
  EditorLink,
  RivtoEditorApi,
} from "@chulane/rivto";

/** Destination used by a cross-document page drag. */
export interface CrossDocumentBlockTransferPlacement {
  /** Existing destination block, or null when appending roots to an empty page. */
  readonly targetId: string | null;
  /** Relationship to the destination block. Ignored when targetId is null. */
  readonly position: "before" | "after" | "inside";
}

/** Complete data transported between two independent editor documents. */
interface CrossDocumentBlockTransferBundle {
  readonly blocks: readonly EditorBlockInput[];
  readonly links: readonly EditorLink[];
}

function collectBlockIds(block: EditorBlock, ids: Set<string>): void {
  ids.add(block.id);
  block.children.forEach((child) => collectBlockIds(child, ids));
}

function prepareBlock(editor: RivtoEditorApi, block: EditorBlock): EditorBlockInput {
  return editor.blocks.registry.prepare({
    id: block.id,
    type: block.type,
    collapsed: block.collapsed,
    content: block.content,
    props: structuredClone(block.props),
    pluginData: structuredClone(block.pluginData),
    layout: block.layout ? structuredClone(block.layout) : undefined,
    children: block.children.map((child) => prepareBlock(editor, child)),
  });
}

/**
 * Builds and validates the lossless payload for a page-to-page move.
 *
 * Validation happens before either document changes. Requiring every block
 * definition prevents a custom block from becoming unusable in a destination
 * editor that did not install its extension.
 */
function createCrossDocumentBlockTransferBundle(
  source: RivtoEditorApi,
  destination: RivtoEditorApi,
  rootIds: readonly string[],
  placement: CrossDocumentBlockTransferPlacement,
): CrossDocumentBlockTransferBundle {
  if (source === destination) throw new Error("Cross-document transfer requires different editors");
  if (placement.targetId !== null && !destination.blocks.getBlock(placement.targetId)) {
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
    if (destination.blocks.getBlock(id)) throw new Error(`Destination already contains block ${id}`);
  }

  const links = source.links.getLinks()
    .filter(({ from, to }) => blockIds.has(from.blockId) && blockIds.has(to.blockId))
    .map((link) => structuredClone(link));
  for (const link of links) {
    if (destination.links.getLink(link.id)) throw new Error(`Destination already contains link ${link.id}`);
  }

  return {
    blocks: roots.map((block) => prepareBlock(destination, block)),
    links,
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
  source: RivtoEditorApi,
  destination: RivtoEditorApi,
  rootIds: readonly string[],
  placement: CrossDocumentBlockTransferPlacement,
): void {
  const bundle = createCrossDocumentBlockTransferBundle(source, destination, rootIds, placement);
  destination.batchUpdates(() => {
    const insertedIds = bundle.blocks.map((block) => destination.blocks.insertBlock(block));
    if (placement.targetId !== null) {
      destination.blocks.moveBlocks(insertedIds, placement.targetId, placement.position);
    }
    bundle.links.forEach((link) => destination.links.createLink(link));
  });
  source.batchUpdates(() => {
    rootIds.forEach((id) => source.blocks.removeBlock(id));
  });
}
