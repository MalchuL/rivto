import type { DocumentEditorAPI, EditorBlock, EditorBlockInput } from "@chulane/rivto";
import type { BlockDestination } from "@chulane/document-model";

/** Addressed reads and preparation used before transfer, plus source deletion after insertion. */
type BlockTransferBlocks = Pick<
  DocumentEditorAPI["blocks"],
  | "getBlock"
  | "hasBlock"
  | "prepareInput"
  | "getParentId"
  | "getInsertionDestinationAfter"
  | "removeBlock"
>;

/** Document operations required by transfer; accepts core, runtime, and view editors. */
interface BlockTransferEditor {
  readonly blocks: BlockTransferBlocks;
  readonly history: Pick<DocumentEditorAPI["history"], "batchUpdates">;
  /**
   * Returns the borrowed document identity and its insertion command.
   *
   * @returns Stable document instance; transfer never destroys or replaces it.
   */
  getDocument(): BlockTransferDocument;
}

/** Model insertion boundary; the object itself also identifies the source document. */
interface BlockTransferDocument {
  readonly blocks: Pick<ReturnType<DocumentEditorAPI["getDocument"]>["blocks"], "insertBlock">;
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
type BlockTransferInput = BlockTransferEditor | BlockTransferPanel;

/** Destination used by a cross-document page drag. */
export interface CrossDocumentBlockTransferPlacement {
  /** Existing destination block, or null when appending roots to an empty page. */
  readonly targetId: string | null;
  /** Relationship to the destination block. Ignored when targetId is null. */
  readonly position: "before" | "after" | "inside";
}

/** Coordinates a synchronous transfer while borrowing both documents and their history. */
export class CrossDocumentBlockTransfer {
  /**
   * Captures the source and destination command boundaries for a transfer operation.
   *
   * No subscriptions, input handlers or document ownership are acquired. Panels
   * contribute access checks only; their editor, rendering and lifecycle APIs are not used.
   *
   * @param sourceInput - Runtime supplying source snapshots and deletion commands, optionally panel-bounded.
   * @param destinationInput - Different document-bound runtime supplying destination preparation and insertion commands, optionally panel-bounded.
   */
  constructor(
    private readonly sourceInput: BlockTransferInput,
    private readonly destinationInput: BlockTransferInput,
  ) {}

  /**
   * Moves complete selected subtrees between independent documents.
   *
   * The destination is committed first. Only a successful insertion permits the
   * source deletion, so validation and insertion failures never lose source data.
   * Each batch remains one undo item in its owning Yjs history.
   *
   * @param rootIds - Source subtree identities to preserve during transfer.
   * @param placement - Destination block relationship.
   * @returns Insertion and source deletion have completed in their owning histories.
   * @throws If the models match, IDs collide, a block is missing, panel access fails,
   * destination preparation/insertion fails, or delegated source deletion fails.
   */
  move(rootIds: readonly string[], placement: CrossDocumentBlockTransferPlacement): void {
    const source = "getDocument" in this.sourceInput ? this.sourceInput : this.sourceInput.document;
    const destination =
      "getDocument" in this.destinationInput
        ? this.destinationInput
        : this.destinationInput.document;
    this.validatePanels(rootIds, placement);
    const destinationDocument = destination.getDocument();
    const blocks = this.getTransferBlocks(source, destination, rootIds, placement);
    const prepared = destination.blocks.prepareInput(blocks);
    this.validatePreparedIds(blocks, prepared);
    const insertion = this.insertion(destination, placement);
    destination.history.batchUpdates(() => {
      prepared.forEach((block) => destinationDocument.blocks.insertBlock(block, insertion));
    });
    source.history.batchUpdates(() => {
      rootIds.forEach((id) => source.blocks.removeBlock(id));
    });
  }

  /**
   * Collects every stable identifier in a detached subtree.
   *
   * @param block - Subtree root to visit.
   * @param ids - Destination set receiving root and descendant identifiers.
   * @returns The set contains this subtree's stable identities.
   * @throws If preparation has omitted a required stable block ID.
   */
  private collectBlockIds(block: EditorBlockInput, ids: Set<string>): void {
    if (!block.id) {
      throw new Error("Transfer preparation must preserve block IDs");
    }
    ids.add(block.id);
    block.children?.forEach((child) => this.collectBlockIds(child, ids));
  }

  /**
   * Detaches one complete persisted subtree from its source editor snapshots.
   *
   * @param block - Source subtree to clone.
   * @returns Lossless detached subtree retaining stable identifiers.
   * @throws If the platform cannot clone a persisted payload value.
   */
  private cloneBlock(block: EditorBlock): EditorBlock {
    return structuredClone(block);
  }

  /**
   * Builds the lossless payload and validates placement and identity conflicts.
   *
   * Complete destination preparation happens through prepareInput before its
   * first write, preventing an unavailable custom type from partially importing.
   *
   * @param source - Live document-bound source reads.
   * @param destination - Live destination reads used to reject identity collisions.
   * @param rootIds - Source roots in the requested transfer order.
   * @param placement - Current destination anchor or empty-document append.
   * @returns Detached recursive roots ready for complete destination preparation.
   * @throws If documents match, an anchor or source is missing, IDs collide, or cloning fails.
   */
  private getTransferBlocks(
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
    roots.forEach((block) => this.collectBlockIds(block, blockIds));
    for (const id of blockIds) {
      if (destination.blocks.hasBlock(id)) {
        throw new Error(`Destination already contains block ${id}`);
      }
    }
    return roots.map((block) => this.cloneBlock(block));
  }

  /**
   * Rejects inaccessible sources and destination anchors before payload preparation.
   *
   * A hidden panel root remains a valid inside container; it cannot be used as an
   * outside sibling anchor. Document-only callers have no additional panel boundary.
   *
   * @param rootIds - Complete requested group checked before the first write.
   * @param placement - Current destination relationship.
   * @returns All supplied panel access checks have passed.
   * @throws If a source or destination is outside its panel or protected.
   */
  private validatePanels(
    rootIds: readonly string[],
    placement: CrossDocumentBlockTransferPlacement,
  ): void {
    const source = this.sourceInput;
    const destination = this.destinationInput;
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
   * Checks that destination processing retained every source identity and introduced none.
   *
   * @param blocks - Lossless detached source roots.
   * @param prepared - Complete destination-prepared forest.
   * @returns Both forests contain the same stable identifiers.
   * @throws If preparation changed, omitted or introduced any block identity.
   */
  private validatePreparedIds(
    blocks: readonly EditorBlock[],
    prepared: readonly EditorBlockInput[],
  ): void {
    const sourceIds = new Set<string>();
    const preparedIds = new Set<string>();
    blocks.forEach((block) => this.collectBlockIds(block, sourceIds));
    prepared.forEach((block) => this.collectBlockIds(block, preparedIds));
    if (sourceIds.size !== preparedIds.size || [...sourceIds].some((id) => !preparedIds.has(id))) {
      throw new Error("Transfer preparation must preserve block IDs");
    }
  }

  /**
   * Translates the current anchor into actual model hierarchy before insertion.
   *
   * @param destination - Live destination commands used for sibling placement.
   * @param placement - Existing target relationship or append without an anchor.
   * @returns Actual parent and optional next sibling, bounded to a hidden panel root when present.
   * @throws Delegated hierarchy read failures for unavailable sibling anchors.
   */
  private insertion(
    destination: BlockTransferEditor,
    placement: CrossDocumentBlockTransferPlacement,
  ): BlockDestination {
    if (placement.targetId === null) {
      const parentId =
        "getDocument" in this.destinationInput ? null : (this.destinationInput.rootBlockId ?? null);
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
}
