import type { DocumentModel } from "@chulane/document-model";
import type { EditorStorage } from "../../editor/editor-storage";
import type { EditorStorageOptions, ReactEditorApi } from "../../editor/types";
import { waitWithAbort } from "../../editor/wait-with-abort";
import type { BlockReference, BlockResolution } from "./types";

/** Resolves document-qualified block references and observes source relocation. */
export class BlockReferenceResolver {
  private readonly locationSubscriptions = new Set<() => void>();
  private destroyed = false;
  /** @param storage - Open document cache. @param options - Host metadata and resolution policies. */
  constructor(
    private readonly storage: EditorStorage,
    private readonly options: Pick<EditorStorageOptions, "resolveBlock" | "lookupDocumentIds">,
  ) {}
  /**
   * Resolves a document-qualified reference without acquiring document content.
   * The preferred loaded document is checked first. Application metadata supplies
   * unloaded candidates; otherwise only loaded documents can participate in fallback.
   * An unloaded preferred address without a metadata lookup is retained until its
   * view loads it, since provider attachment does not prove remote data has arrived.
   * Hosts with asynchronous remote content supply metadata listing its source or a
   * custom resolver to distinguish missing blocks from content still in transit.
   * @param reference - Persisted preferred document and document-local block ID.
   * @param options - Cancellation for this request, including custom resolvers.
   * @returns Preferred match, or first sorted fallback with an ambiguity flag; absence has no documentId.
   * @throws On cancellation, destruction, or application lookup failure; failures never trigger fallback.
   */
  async resolveBlock(
    reference: BlockReference,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BlockResolution> {
    this.assertActive();
    options.signal?.throwIfAborted();
    let pending: Promise<BlockResolution>;
    if (this.options.resolveBlock) {
      pending = this.options.resolveBlock(reference, options);
    } else {
      pending = this.resolveDefault(reference, options);
    }
    const result = await waitWithAbort(pending, options.signal);
    this.assertActive();
    options.signal?.throwIfAborted();
    return result;
  }

  /**
   * Observes the resolved document without acquiring or loading its content.
   *
   * The last known identity is retained after deletion so an acquiring view can
   * keep source history alive. Direct references observe only their preferred
   * source; unresolved or fallback references observe loaded candidates as well.
   * Ordinary text changes do not perform another location search.
   * Each search publishes its result or error without scheduling another attempt.
   * The first notification follows completion of the initial search; subscribing
   * does not publish a synthetic missing result before that search completes.
   *
   * @param reference - Persisted preferred document and document-local target ID.
   * @param listener - Receives a completed resolution, missing location, or lookup error.
   * @returns Cleanup cancelling pending searches and removing node/storage subscriptions.
   * @throws If this resolver has been destroyed.
   */
  subscribeBlockLocation(
    reference: BlockReference,
    listener: (resolution: BlockResolution, error?: unknown) => void,
  ): () => void {
    this.assertActive();
    const controller = new AbortController();
    const watched = new Map<DocumentModel, () => void>();
    let location: BlockResolution = { ambiguous: false };
    let failed = false;
    let settled = false;
    let generation = 0;
    /**
     * Starts one location search and supersedes results from earlier searches.
     *
     * Registry and source-presence changes may start another search through
     * the subscriptions below; failed or missing results do not schedule one.
     *
     * @returns Scheduling of one lookup and publication of its current result or error.
     */
    const search = () => {
      const current = ++generation;
      // CRDT structure observers can run before every record in a transaction is visible.
      queueMicrotask(() => {
        if (controller.signal.aborted || current !== generation) {
          return;
        }
        void this.resolveBlock(reference, { signal: controller.signal })
          .then((result) => {
            if (controller.signal.aborted || current !== generation) {
              return;
            }
            const next = result.documentId
              ? result
              : { ...result, documentId: location.documentId };
            if (
              !settled ||
              next.documentId !== location.documentId ||
              next.ambiguous !== location.ambiguous ||
              failed
            ) {
              failed = false;
              settled = true;
              location = next;
              listener(next);
              watch();
            }
          })
          .catch((error) => {
            if (!controller.signal.aborted && current === generation) {
              failed = true;
              listener(location, error);
            }
          });
      });
    };
    const watch = () => {
      const direct =
        (!location.documentId || location.documentId === reference.documentId) &&
        this.storage.getDocument(reference.documentId)?.blocks.hasBlock(reference.blockId);
      const models = new Set(
        direct ? [this.storage.getDocument(reference.documentId)!] : this.storage.getDocuments(),
      );
      watched.forEach((unsubscribe, model) => {
        if (!models.has(model)) {
          unsubscribe();
          watched.delete(model);
        }
      });
      models.forEach((model) => {
        if (!watched.has(model)) {
          let present = model.blocks.hasBlock(reference.blockId);
          watched.set(
            model,
            model.blocks.subscribeBlockNode(reference.blockId, () => {
              queueMicrotask(() => {
                if (controller.signal.aborted) {
                  return;
                }
                const next = model.blocks.hasBlock(reference.blockId);
                if (next !== present) {
                  present = next;
                  watch();
                  search();
                }
              });
            }),
          );
        }
      });
    };
    const refresh = () => {
      watch();
      search();
    };
    const unsubscribe = this.storage.subscribeDocuments(refresh);
    const cleanup = () => {
      controller.abort();
      unsubscribe();
      this.locationSubscriptions.delete(cleanup);
      watched.forEach((stop) => stop());
      watched.clear();
    };
    this.locationSubscriptions.add(cleanup);
    refresh();
    return cleanup;
  }

  /**
   * Locates the first matching block among open documents without loading or traversing forests.
   * @param blockId - Document-local identity to find.
   * @returns Matching single editor in sorted document ID order, or undefined when absent.
   * Multiple documents may contain the ID; use resolveBlock when ambiguity matters.
   */
  findEditorWithBlock(blockId: string): ReactEditorApi | undefined {
    return this.storage
      .getEditors()
      .filter((editor) => editor.blocks.hasBlock(blockId))
      .sort((a, b) => a.getDocument().id.localeCompare(b.getDocument().id))[0];
  }
  /** @param blockId - Document-local identity. @returns First loaded containing model in sorted document ID order, or undefined. */
  findDocumentWithBlock(blockId: string): DocumentModel | undefined {
    return this.findEditorWithBlock(blockId)?.getDocument();
  }

  /** Cancels every outstanding location observer; documents remain owned by storage. */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.locationSubscriptions.forEach((cleanup) => cleanup());
  }

  /**
   * Resolves a block reference using its preferred document, optional index lookup, and loaded documents.
   *
   * @param reference - Block ID and preferred document identity to resolve.
   * @param options - Optional abort signal forwarded to the document index lookup.
   * @returns Preferred or first sorted document match with ambiguity metadata; the document ID can be undefined.
   */
  private async resolveDefault(
    reference: BlockReference,
    options: { readonly signal?: AbortSignal },
  ): Promise<BlockResolution> {
    const preferred = this.storage.getDocument(reference.documentId);
    if (preferred?.blocks.hasBlock(reference.blockId)) {
      return { documentId: reference.documentId, ambiguous: false };
    }
    if (!preferred && reference.documentId && !this.options.lookupDocumentIds) {
      return { documentId: reference.documentId, ambiguous: false };
    }
    const indexed = (await this.options.lookupDocumentIds?.(reference.blockId, options)) ?? [];
    const ids = [
      ...new Set([
        ...indexed,
        ...this.storage
          .getDocuments()
          .filter((model) => model.blocks.hasBlock(reference.blockId))
          .map((model) => model.id),
      ]),
    ].sort();
    if (ids.includes(reference.documentId)) {
      return { documentId: reference.documentId, ambiguous: false };
    }
    return { documentId: ids[0], ambiguous: ids.length > 1 };
  }
  /**
   * Guards access after resolver destruction.
   *
   * @throws If this block reference resolver has been destroyed.
   */
  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("Block reference resolver is destroyed");
    }
  }
}
