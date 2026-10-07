import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl, type DocumentModel } from "@chulane/document-model";
import { createRivtoEditor, type RivtoEditorApi } from "@chulane/rivto";
import { createReactEditor } from "./react-editor";
import type { ReactEditor } from "./types";

/** Loading and construction policies; returned models become storage-owned. */
export interface EditorStorageOptions {
  /** Loads a model for this identity; defaults to creating an empty Yjs document. */
  readonly openDocument?: (documentId: string) => Promise<DocumentModel>;
  /**
   * Configures the supplied storage-owned core's definitions, defaults, and commands
   * and returns a React runtime wrapping that same core. Defaults to createReactEditor.
   * Storage creates and disposes the core; this callback must not replace it.
   */
  readonly createEditor?: (editor: RivtoEditorApi) => ReactEditor;
  /** Lists containing document IDs from application metadata without acquiring their content; ordinary edits never invoke it. */
  readonly lookupDocumentIds?: (blockId: string, options: { readonly signal?: AbortSignal }) => Promise<readonly string[]>;
  /** Replaces preferred-document-first resolution; receives the persisted address and never changes its props. */
  readonly resolveBlock?: (reference: BlockReference, options: { readonly signal?: AbortSignal }) => Promise<BlockResolution>;
  /** Optional registry metadata notifications used to retry unresolved embedding locations. */
  readonly subscribeDocumentIds?: (listener: () => void) => () => void;
  /** Reports asynchronous release failures from view cleanup. */
  readonly onError?: (error: unknown) => void;
}

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

/** One independently releasable view consumer of an editor and its model. */
export interface EditorAcquisition {
  readonly editor: ReactEditor;
  readonly document: DocumentModel;
  /** Idempotently releases this consumer, destroying editor and model after the last consumer. */
  release(): Promise<void>;
}

interface Entry {
  consumers: number;
  explicit: boolean;
  pending: Promise<ReactEditor>;
  editor?: ReactEditor;
  core?: RivtoEditorApi;
  closing?: Promise<void>;
}


/**
 * Caches document-bound React editors without routing ordinary document operations.
 * Owns loaded models, React runtimes, and core lifetimes; definitions, history, and selection
 * remain on each single editor. Explicit requests can load a document, while
 * block lookup reads open documents and optional application metadata without acquiring candidates.
 */
export class EditorStorage {
  private readonly entries = new Map<string, Entry>();
  private readonly documentListeners = new Set<() => void>();
  private readonly locationSubscriptions = new Set<() => void>();
  private destroyed = false;
  private destruction?: Promise<void>;
  private readonly openDocument: NonNullable<EditorStorageOptions["openDocument"]>;
  private readonly createEditor: NonNullable<EditorStorageOptions["createEditor"]>;
  private readonly unsubscribeRegistry?: () => void;

  /** @param options - Optional document loader, editor factory, and embedding lookup policy. */
  constructor(private readonly options: EditorStorageOptions = {}) {
    this.openDocument = options.openDocument ?? (async (id) => new DocumentModelImpl(new YjsDoc(id)));
    this.createEditor = options.createEditor ?? ((editor) => createReactEditor({ editor }));
    this.unsubscribeRegistry = options.subscribeDocumentIds?.(() => this.notifyDocuments());
  }

  /** @param listener - Open/close or registry observer; text edits do not notify it. @returns Cleanup. */
  subscribeDocuments(listener: () => void): () => void { this.documentListeners.add(listener); return () => { this.documentListeners.delete(listener); }; }
  /** @returns Usable editors, excluding pending and closing entries. */
  getEditors(): readonly ReactEditor[] { return [...this.entries.values()].flatMap((entry) => entry.editor && !entry.closing ? [entry.editor] : []); }
  /** @returns Loaded models without acquiring them. */
  getDocuments(): readonly DocumentModel[] { return this.getEditors().map((editor) => editor.getDocument()); }
  /** @param documentId - Requested identity. @returns Constructed editor, or undefined before construction, while closing, or absent. */
  getEditor(documentId: string): ReactEditor | undefined {
    const entry = this.entries.get(documentId);
    return entry?.closing ? undefined : entry?.editor;
  }
  /** @param documentId - Requested identity. @returns Loaded model, or undefined without a usable editor. */
  getDocument(documentId: string): DocumentModel | undefined { return this.getEditor(documentId)?.getDocument(); }

  /**
   * Gets or opens one editor, retaining explicit ownership until closeEditor.
   * Concurrent calls share loading and return the same core. Failed loads can be retried.
   * @param documentId - Nonempty identity passed to the loader.
   * @returns Core permanently bound to the returned document.
   * @throws If opening/factory setup fails, identity differs, or storage is destroyed.
   */
  async getSingleEditor(documentId: string): Promise<RivtoEditorApi> {
    const entry = await this.getEntry(documentId);
    if (entry.closing) return this.getSingleEditor(documentId);
    entry.explicit = true;
    await entry.pending;
    this.assertActive();
    return entry.core!;
  }

  /**
   * Retains a model/editor for one view without adding explicit ownership.
   * Cancellation releases only this consumer; another consumer's load continues.
   * @param documentId - Identity to acquire.
   * @param options - Optional consumer cancellation signal.
   * @returns Editor, model, and independently idempotent release.
   * @throws On cancellation, shutdown, or document loading failure.
   */
  async acquireEditor(documentId: string, options: { readonly signal?: AbortSignal } = {}): Promise<EditorAcquisition> {
    options.signal?.throwIfAborted();
    const entry = await this.getEntry(documentId);
    if (entry.closing) return this.acquireEditor(documentId, options);
    entry.consumers += 1;
    let released: Promise<void> | undefined;
    const release = () => {
      if (!released) {
        entry.consumers -= 1;
        released = entry.consumers === 0 && !entry.explicit ? this.close(documentId, entry) : Promise.resolve();
      }
      return released;
    };
    try {
      const editor = await this.waitFor(entry.pending, options.signal);
      options.signal?.throwIfAborted(); this.assertActive();
      return { editor, document: editor.getDocument(), release };
    } catch (error) {
      void release().catch((failure) => this.reportError(failure));
      throw error;
    }
  }

  /**
   * Releases explicit ownership; mounted views keep their consumers alive.
   * @param documentId - Identity previously requested through getSingleEditor.
   * @returns Resolves after disposal if this was the final owner; missing entries are ignored.
   */
  async closeEditor(documentId: string): Promise<void> {
    const entry = this.entries.get(documentId);
    if (!entry) return;
    entry.explicit = false;
    if (entry.consumers === 0) await this.close(documentId, entry);
  }

  /**
   * Locates the first matching block among open documents without loading or traversing forests.
   * @param blockId - Document-local identity to find.
   * @returns Matching single editor in sorted document ID order, or undefined when absent.
   * Multiple documents may contain the ID; use resolveBlock when ambiguity matters.
   */
  findEditorWithBlock(blockId: string): ReactEditor | undefined {
    return this.getEditors().filter((editor) => editor.blocks.hasBlock(blockId))
      .sort((a, b) => a.getDocument().id.localeCompare(b.getDocument().id))[0];
  }
  /** @param blockId - Document-local identity. @returns First loaded containing model in sorted document ID order, or undefined. */
  findDocumentWithBlock(blockId: string): DocumentModel | undefined { return this.findEditorWithBlock(blockId)?.getDocument(); }

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
    const result = await this.waitFor(pending, options.signal);
    this.assertActive(); options.signal?.throwIfAborted();
    return result;
  }

  private async resolveDefault(reference: BlockReference, options: { readonly signal?: AbortSignal }): Promise<BlockResolution> {
    const preferred = this.getDocument(reference.documentId);
    if (preferred?.blocks.hasBlock(reference.blockId)) return { documentId: reference.documentId, ambiguous: false };
    if (!preferred && reference.documentId && !this.options.lookupDocumentIds) return { documentId: reference.documentId, ambiguous: false };
    const indexed = await this.options.lookupDocumentIds?.(reference.blockId, options) ?? [];
    const ids = [...new Set([...indexed, ...this.getDocuments().filter((model) => model.blocks.hasBlock(reference.blockId)).map((model) => model.id)])].sort();
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
      const direct = (!location.documentId || location.documentId === reference.documentId) && this.getDocument(reference.documentId)?.blocks.hasBlock(reference.blockId);
      const models = new Set(direct ? [this.getDocument(reference.documentId)!] : this.getDocuments());
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
    const unsubscribe = this.subscribeDocuments(refresh);
    const cleanup = () => {
      controller.abort(); unsubscribe(); this.locationSubscriptions.delete(cleanup);
      watched.forEach((stop) => stop()); watched.clear();
    };
    this.locationSubscriptions.add(cleanup);
    listener(location);
    refresh();
    return cleanup;
  }


  /** @returns Idempotent shutdown promise; all models are disposed even if one cleanup fails. */
  destroy(): Promise<void> {
    if (this.destruction) return this.destruction;
    this.destroyed = true; this.unsubscribeRegistry?.();
    this.locationSubscriptions.forEach((cleanup) => cleanup());
    this.destruction = (async () => {
      const results = await Promise.allSettled([...this.entries].map(([id, entry]) => this.close(id, entry)));
      this.documentListeners.clear();
      const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      if (errors.length) throw new AggregateError(errors, "Editor storage teardown failed");
    })();
    return this.destruction;
  }

  /** Finds a shared opening entry, waiting for final teardown before reopening. */
  private async getEntry(id: string): Promise<Entry> {
    this.assertActive();
    if (!id.trim()) throw new Error("Document ID is required");
    let entry = this.entries.get(id);
    if (entry?.closing) { await entry.closing; return this.getEntry(id); }
    if (!entry) {
      entry = { consumers: 0, explicit: false, pending: Promise.resolve().then(() => this.load(id, entry!)) };
      this.entries.set(id, entry);
      void entry.pending.catch(() => { if (this.entries.get(id) === entry && !entry?.closing) this.entries.delete(id); });
    }
    return entry;
  }

  /** Transfers the loaded model into a fixed core; setup failures dispose every created resource. */
  private async load(id: string, entry: Entry): Promise<ReactEditor> {
    let document: DocumentModel | undefined; let editor: ReactEditor | undefined;
    try {
      document = await this.openDocument(id);
      if (document.id !== id) throw new Error(`Expected document ${id}, received ${document.id}`);
      this.assertActive();
      entry.core = createRivtoEditor({ document });
      editor = this.createEditor(entry.core);
      entry.editor = editor;
      if (editor.getDocument() !== document || editor.blocks !== entry.core.blocks) throw new Error("Editor factory must bind the supplied core");
      this.notifyDocuments();
      return editor;
    } catch (error) {
      entry.editor = undefined;
      const errors: unknown[] = [error];
      for (const cleanup of [() => editor?.destroy(), () => entry.core?.destroy(), () => document?.destroy()]) {
        try { await cleanup(); } catch (failure) { errors.push(failure); }
      }
      if (errors.length > 1) throw new AggregateError(errors, "Editor setup and cleanup failed");
      throw error;
    }
  }

  /** Closes an entry once, including a pending load, and removes it after disposal. */
  private close(id: string, entry: Entry): Promise<void> {
    if (entry.closing) return entry.closing;
    entry.closing = (async () => {
      try {
        let editor: ReactEditor;
        try { editor = await entry.pending; } catch { return; }
        const errors: unknown[] = [];
        for (const action of [() => editor.destroy(), () => entry.core!.destroy(), () => editor.getDocument().destroy()]) {
          try { await action(); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, `Closing document ${id} failed`);
      } finally {
        if (this.entries.get(id) === entry) this.entries.delete(id);
        this.notifyDocuments();
      }
    })();
    this.notifyDocuments();
    return entry.closing;
  }
  /** Publishes only document lifecycle or registry metadata changes. */
  private notifyDocuments(): void { this.documentListeners.forEach((listener) => listener()); }
  /** Rejects operations after shutdown starts. */
  private assertActive(): void { if (this.destroyed) throw new Error("Editor storage is destroyed"); }
  /** Reports asynchronous view release failures. */
  private reportError(error: unknown): void { (this.options.onError ?? console.error)(error); }
  /** Cancels one waiter without cancelling shared opening; always removes the abort listener. */
  private async waitFor<Result>(pending: Promise<Result>, signal?: AbortSignal): Promise<Result> {
    if (!signal) return pending;
    signal.throwIfAborted();
    let onAbort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener("abort", onAbort, { once: true }); });
    try { return await Promise.race([pending, cancelled]); }
    finally { signal.removeEventListener("abort", onAbort); }
  }
}
