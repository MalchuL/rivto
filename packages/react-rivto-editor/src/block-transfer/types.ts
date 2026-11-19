import type { DocumentEditorAPI, PanelAPI } from "@chulane/rivto";

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

/** Optional panel access boundary; transfer never attaches or destroys panel resources. */
export interface BlockTransferPanel {
  readonly rootBlockId?: string;
  /** Checks whether source blocks and sibling anchors are accessible and removable here. */
  readonly blocks: Pick<PanelAPI["blocks"], "hasBlock" | "canRemove">;
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
