import type { BlockTransferBlocks } from "../../block-transfer/types";
import type { BlockManagerApi } from "@chulane/rivto";
import type { ReactPanelApi } from "../../types";
import type { BlockBehaviorsApi } from "../../managers/blocks/block-behaviors-api";

/** Stable model identity used by drag operations. */
interface BlockDragModel {
  readonly id: string;
}

/** Transfer operations plus the reads and moves needed within one document. */
interface BlockDragBlocks extends BlockTransferBlocks {
  readonly getChildIds: BlockManagerApi["getChildIds"];
  readonly moveBlocks: BlockManagerApi["moveBlocks"];
}

/** Model operations borrowed by local moves and cross-document transfer. */
interface BlockDragDocument {
  readonly blocks: BlockDragBlocks;
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
  readonly blocks: Pick<BlockManagerApi, "canMove">;
}

/** Reads and commands borrowed from the source or destination for local moves and cross-document transfers. Panel registration and destruction belong to the host. */
export interface BlockDragOperations {
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
