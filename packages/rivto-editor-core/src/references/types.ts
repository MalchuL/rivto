/** Persisted address of a block; block IDs are unique only within their document. */
export interface BlockReference {
  readonly documentId: string;
  readonly blockId: string;
}

/** Resolved address for display; ambiguity does not prevent the default resolver choosing a source. */
export interface BlockResolution {
  readonly documentId?: string;
  readonly ambiguous: boolean;
}

/** Addressed document reads borrowed by reference lookup; no mutation or lifecycle access. */
export interface ReferencedDocument {
  readonly id: string;
  readonly blocks: {
    /**
     * Checks whether an identity is currently present in this document.
     *
     * @param blockId - Document-local identity.
     * @returns Whether the document contains the block.
     */
    hasBlock(blockId: string): boolean;
    /**
     * Observes changes to one addressed block, including removal and restoration.
     *
     * @param blockId - Document-local identity to observe.
     * @param listener - Called after changes; lookup reconciles after the current transaction.
     * @returns Disposer releasing only this observation.
     */
    subscribeBlockNode(blockId: string, listener: () => void): () => void;
  };
}

/** Borrowed editor identity used by synchronous loaded-editor lookup. */
export interface ReferencedEditor<Model extends ReferencedDocument> {
  readonly blocks: Pick<ReferencedDocument["blocks"], "hasBlock">;
  /**
   * Reads the editor's stable document without acquiring another reference.
   *
   * @returns Borrowed document; the resolver never destroys it.
   */
  getDocument(): Model;
}

/** Loaded-document registry; lookup never asks it to load a missing document. */
export interface BlockReferenceSource<
  Model extends ReferencedDocument,
  Editor extends ReferencedEditor<Model>,
> {
  /**
   * Looks up a currently available document.
   *
   * @param documentId - Stable document identity.
   * @returns Borrowed document, or undefined while absent, loading, or closing.
   */
  getDocument(documentId: string): Model | undefined;
  /**
   * Lists available documents without loading additional candidates.
   *
   * @returns Borrowed documents whose addressed block operations can be read.
   */
  getDocuments(): readonly Model[];
  /**
   * Lists available editors for synchronous lookup by block identity.
   *
   * @returns Borrowed editors; this operation does not retain them.
   */
  getEditors(): readonly Editor[];
  /**
   * Observes document availability and optional host index changes.
   *
   * @param listener - Called when loaded candidates or host metadata change.
   * @returns Disposer releasing only this registry subscription.
   */
  subscribeDocuments(listener: () => void): () => void;
}

/** Host metadata policies supplementing addressed reads of loaded documents. */
export interface BlockReferenceOptions {
  /**
   * Finds source document IDs from metadata without acquiring their content.
   *
   * Ordinary text edits do not invoke this lookup; source presence or registry
   * changes may start a new search.
   *
   * @param blockId - Document-local identity whose possible sources are requested.
   * @param options - Cancellation of this lookup, independent of other consumers.
   * @returns A promise resolving with candidate document IDs.
   * @throws Rejects when the host lookup fails or is cancelled.
   */
  readonly lookupDocumentIds?: (
    blockId: string,
    options: { readonly signal?: AbortSignal },
  ) => Promise<readonly string[]>;
  /**
   * Replaces preferred-document-first lookup without changing the persisted address.
   *
   * @param reference - Preferred document and document-local block identity.
   * @param options - Cancellation for this consumer's lookup.
   * @returns A promise resolving with the chosen location or an absent document ID.
   * @throws Rejects on host lookup failure or cancellation.
   */
  readonly resolveBlock?: (
    reference: BlockReference,
    options: { readonly signal?: AbortSignal },
  ) => Promise<BlockResolution>;
}
