import type { DocumentEditorAPI } from "@chulane/rivto";

/** Addressed reads and preparation used before transfer, plus source deletion after insertion. */
export type BlockTransferBlocks = Pick<
  DocumentEditorAPI["blocks"],
  | "getBlock"
  | "hasBlock"
  | "removeBlocks"
  | "importForest"
  | "canMove"
  | "getParentId"
  | "getInsertionDestinationAfter"
>;

/** Document operations required by transfer; accepts core, runtime, and view editors. */
export interface BlockTransferEditor {
  readonly blocks: BlockTransferBlocks;
  /**
   * Returns the borrowed document identity used to reject same-document transfers.
   *
   * @returns Stable document instance; transfer never destroys or replaces it.
   */
  getDocument(): object;
}

/** Read-only occurrence permissions used to protect sources and sibling anchors. */
interface BlockTransferPanelBlocks extends Pick<DocumentEditorAPI["blocks"], "hasBlock"> {
  /**
   * Checks whether this occurrence may remove the identified source or sibling anchor.
   *
   * @param id - Persisted block identity to check against panel access and protection.
   * @returns Whether the block is accessible and removable in this occurrence.
   */
  canRemove(id: string): boolean;
}

/** Optional panel access boundary; transfer never attaches or destroys panel resources. */
export interface BlockTransferPanel {
  readonly rootBlockId?: string;
  readonly blocks: BlockTransferPanelBlocks;
  readonly document: BlockTransferEditor;
}

/** A document-bound command boundary, optionally constrained to one displayed panel. */
export type BlockTransferInput = BlockTransferEditor | BlockTransferPanel;

/** Destination used by a cross-document page drag. */
export interface CrossDocumentBlockTransferPlacement {
  /** Existing destination block, or null when appending roots to an empty page. */
  readonly targetId: string | null;
  /** Relationship to the destination block. Ignored when targetId is null. */
  readonly position: "before" | "after" | "inside";
}
