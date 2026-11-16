import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactPanelApi } from "../../../panels/types";
import type { BlockBehaviorsApi } from "../../../managers/blocks/block-behaviors-api";

/** Stable model identity used by drag operations. */
interface BlockDragModel {
  readonly id: ReturnType<DocumentEditorAPI["getDocument"]>["id"];
}

/** Model operations borrowed by local moves and cross-document transfer. */
interface BlockDragDocument {
  readonly blocks: Pick<
    DocumentEditorAPI["blocks"],
    | "getBlock"
    | "getChildIds"
    | "getParentId"
    | "hasBlock"
    | "removeBlocks"
    | "importForest"
    | "canMove"
    | "getInsertionDestinationAfter"
    | "moveBlocks"
  >;
  /**
   * Reads the stable document used for identity comparisons.
   *
   * @returns Borrowed model; drag operations never destroy or replace it.
   */
  getDocument(): BlockDragModel;
}

/** Shared host behavior capability used by receiving occurrences. */
interface BlockDragEditor {
  readonly blockBehaviors: Pick<BlockBehaviorsApi, "childrenVisible">;
  readonly blocks: Pick<DocumentEditorAPI["blocks"], "canMove">;
}

/** Addressed source and receiving commands; excludes panel registration and destruction. */
export interface CrossDocumentBlockPanel {
  readonly rootBlockId?: string;
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    | "getBlock"
    | "getBlockNode"
    | "getBlocks"
    | "getRootIds"
    | "hasBlock"
    | "canRemove"
    | "moveBlocks"
  >;
  readonly document: BlockDragDocument;
  readonly selection: Pick<ReactPanelApi["selection"], "set" | "clear">;
  readonly editor: BlockDragEditor;
}
