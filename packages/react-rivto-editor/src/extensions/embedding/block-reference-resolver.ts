import type { EditorRuntime } from "../../editor/editor-runtime";
import type { DocumentModel } from "@chulane/document-model";
import type { EditorStorage, EditorStorageOptions } from "../../editor/editor-storage";
import { waitWithAbort } from "../../editor/wait-with-abort";

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

/** Resolves document-qualified block references and observes source relocation. */
export class BlockReferenceResolver {
  private readonly locationSubscriptions = new Set<() => void>();
  private destroyed = false;
  /** @param storage - Open document cache. @param options - Host metadata and resolution policies. */
  constructor(private readonly storage: EditorStorage, private readonly options: Pick<EditorStorageOptions, "resolveBlock" | "lookupDocumentIds">) {}
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
  async resolveBlock(reference: BlockReference, options: { readonly signal?: AbortSignal } = {}): Promise<BlockResolution> {
    this.assertActive(); options.signal?.throwIfAborted();
    let pending: Promise<BlockResolution>;
    if (this.options.resolveBlock) pending = this.options.resolveBlock(reference, options);
    else pending = this.resolveDefault(reference, options);
    const result = await waitWithAbort(pending, options.signal);
    this.assertActive(); options.signal?.throwIfAborted();
    return result;
  }

  private async resolveDefault(reference: BlockReference, options: { readonly signal?: AbortSignal }): Promise<BlockResolution> {
    const preferred = this.storage.getDocument(reference.documentId);
    if (preferred?.blocks.hasBlock(reference.blockId)) return { documentId: reference.documentId, ambiguous: false };
    if (!preferred && reference.documentId && !this.options.lookupDocumentIds) return { documentId: reference.documentId, ambiguous: false };
    const indexed = await this.options.lookupDocumentIds?.(reference.blockId, options) ?? [];
    const ids = [...new Set([...indexed, ...this.storage.getDocuments().filter((model) => model.blocks.hasBlock(reference.blockId)).map((model) => model.id)])].sort();
    if (ids.includes(reference.documentId)) return { documentId: reference.documentId, ambiguous: false };
    return { documentId: ids[0], ambiguous: ids.length > 1 };
  }

  /**
   * Observes the resolved document without acquiring or loading its content.
   * The last known identity is retained after deletion so an acquiring view can
   * keep source history alive. Direct references observe only their preferred
   * source; unresolved or fallback references observe loaded candidates as well.
   * Ordinary text changes do not perform another location search.
   * @param reference - Persisted preferred document and document-local target ID.
   * @param listener - Receives the current resolution, absence while unresolved, or a lookup error.
   * @returns Cleanup cancelling searches and removing node/storage subscriptions.
   */
  subscribeBlockLocation(reference: BlockReference, listener: (resolution: BlockResolution, error?: unknown) => void): () => void {
    this.assertActive();
    const controller = new AbortController();
    const watched = new Map<DocumentModel, () => void>();
    let location: BlockResolution = { ambiguous: false };
    let failed = false;
    let generation = 0;
    const search = () => {
      const current = ++generation;
      // CRDT structure observers can run before every record in a transaction is visible.
      queueMicrotask(() => {
        if (controller.signal.aborted || current !== generation) return;
        void this.resolveBlock(reference, { signal: controller.signal }).then((result) => {
          if (controller.signal.aborted || current !== generation) return;
          const next = result.documentId ? result : { ...result, documentId: location.documentId };
          if (next.documentId !== location.documentId || next.ambiguous !== location.ambiguous || failed) {
            failed = false; location = next; listener(next);
            watch();
          }
        }).catch((error) => {
          if (!controller.signal.aborted && current === generation) { failed = true; listener(location, error); }
        });
      });
    };
    const watch = () => {
      const direct = (!location.documentId || location.documentId === reference.documentId) && this.storage.getDocument(reference.documentId)?.blocks.hasBlock(reference.blockId);
      const models = new Set(direct ? [this.storage.getDocument(reference.documentId)!] : this.storage.getDocuments());
      watched.forEach((unsubscribe, model) => {
        if (!models.has(model)) { unsubscribe(); watched.delete(model); }
      });
      models.forEach((model) => {
        if (!watched.has(model)) {
          let present = model.blocks.hasBlock(reference.blockId);
          watched.set(model, model.blocks.subscribeBlockNode(reference.blockId, () => {
            queueMicrotask(() => {
              if (controller.signal.aborted) return;
              const next = model.blocks.hasBlock(reference.blockId);
              if (next !== present) { present = next; watch(); search(); }
            });
          }));
        }
      });
    };
    const refresh = () => { watch(); search(); };
    const unsubscribe = this.storage.subscribeDocuments(refresh);
    const cleanup = () => {
      controller.abort(); unsubscribe(); this.locationSubscriptions.delete(cleanup);
      watched.forEach((stop) => stop()); watched.clear();
    };
    this.locationSubscriptions.add(cleanup);
    listener(location);
    refresh();
    return cleanup;
  }



  /**
   * Locates the first matching block among open documents without loading or traversing forests.
   * @param blockId - Document-local identity to find.
   * @returns Matching single editor in sorted document ID order, or undefined when absent.
   * Multiple documents may contain the ID; use resolveBlock when ambiguity matters.
   */
  findRuntimeWithBlock(blockId: string): EditorRuntime | undefined {
    return this.storage.getRuntimes().filter((editor) => editor.blocks.hasBlock(blockId))
      .sort((a, b) => a.getDocument().id.localeCompare(b.getDocument().id))[0];
  }
  /** @param blockId - Document-local identity. @returns First loaded containing model in sorted document ID order, or undefined. */
  findDocumentWithBlock(blockId: string): DocumentModel | undefined { return this.findRuntimeWithBlock(blockId)?.getDocument(); }

  /** Cancels every outstanding location observer; documents remain owned by storage. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.locationSubscriptions.forEach((cleanup) => cleanup());
  }
  private assertActive(): void { if (this.destroyed) throw new Error("Block reference resolver is destroyed"); }
}
