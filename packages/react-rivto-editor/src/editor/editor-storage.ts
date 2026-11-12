import { Listeners } from "@chulane/rivto-utils";
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl, type DocumentModel } from "@chulane/document-model";
import { BlockReferenceResolver, createDocumentEditor, waitWithAbort } from "@chulane/rivto";
import { createReactEditor } from "./react-editor";
import type { EditorAcquisition, EditorStorageOptions, Entry, ReactEditorApi } from "./types";
export type { BlockReference, BlockResolution } from "@chulane/rivto";

/**
 * Runs an acquisition cleanup once without retaining it after invocation.
 *
 * Repeated and reentrant calls share the same completion promise.
 *
 * @param cleanup - Releases one consumer and possibly closes its editor.
 * @returns An idempotent release that drops the cleanup closure before running it;
 * its promise rejects if cleanup fails.
 */
function createAcquisitionRelease(cleanup: () => Promise<void>): () => Promise<void> {
  let pending: (() => Promise<void>) | undefined = cleanup;
  let released: Promise<void> | undefined;
  return () => {
    if (!released) {
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      released = new Promise<void>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
      });
      const current = pending;
      pending = undefined;
      try {
        current?.().then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    }
    return released;
  };
}

/**
 * Loads documents and shares one React runtime and core editor for each document ID.
 *
 * Storage owns each loaded model, its core editor, and the React runtime created by
 * the configured factory. Ordinary editing uses those managers directly; storage
 * does not select a document for commands. Definitions, history, and selection stay
 * on the corresponding editor instead of being copied into this cache.
 *
 * acquireEditor retains one independent consumer and returns its release callback.
 * Each acquisition owns one reference until its release callback is called.
 * A document closes when its final consumer releases it, or on destroy().
 * Concurrent opens share the same pending load, and a failed load can be retried.
 *
 * blockReferences resolves embedding sources from loaded documents and application
 * metadata without opening candidate documents or incrementing their consumer count.
 */
export class EditorStorage {
  /** Resolves embedding sources without acquiring candidate documents. */
  readonly blockReferences: BlockReferenceResolver<DocumentModel, ReactEditorApi>;
  private readonly entries = new Map<string, Entry>();
  private readonly documentListeners = new Listeners<{ changed: void }>();
  private destroyed = false;
  private destruction?: Promise<void>;
  private openDocument?: NonNullable<EditorStorageOptions["openDocument"]>;
  private createEditor?: NonNullable<EditorStorageOptions["createEditor"]>;
  private onError?: EditorStorageOptions["onError"];
  /**
   * Removes the host registry subscription during storage destruction.
   *
   * @returns The registry change listener is detached.
   * @throws If the host's unsubscribe callback fails.
   */
  private unsubscribeRegistry?: () => void;

  /**
   * Creates storage and subscribes to registry changes when a host supplies them.
   *
   * By default, each document uses a new Yjs adapter and the standard React editor.
   * The storage owns models and runtimes produced by the configured factories.
   *
   * @param options - Optional document loader, editor factory, and embedding lookup policy.
   * @throws If the registry subscription fails.
   */
  constructor(options: EditorStorageOptions = {}) {
    this.blockReferences = new BlockReferenceResolver(this, options);
    this.onError = options.onError;
    this.openDocument =
      options.openDocument ?? (async (id) => new DocumentModelImpl(new YjsDoc(id)));
    this.createEditor = options.createEditor ?? ((editor) => createReactEditor({ editor }));
    this.unsubscribeRegistry = options.subscribeDocumentIds?.(() => this.notifyDocuments());
  }

  /**
   * Subscribes to document open, close, and registry metadata changes.
   *
   * Text edits do not notify this listener.
   *
   * @param listener - Callback invoked when the available documents change.
   * @returns An idempotent callback that removes the listener.
   */
  subscribeDocuments(listener: () => void): () => void {
    return this.documentListeners.subscribe("changed", listener);
  }
  /**
   * Lists constructed editors that are not closing.
   *
   * @returns Usable editors, excluding pending and closing entries.
   */
  getEditors(): readonly ReactEditorApi[] {
    return [...this.entries.values()].flatMap((entry) =>
      entry.editor && !entry.closing ? [entry.editor] : [],
    );
  }
  /**
   * Lists models belonging to usable editors without acquiring them.
   *
   * @returns Loaded models; their lifetime remains owned by storage.
   */
  getDocuments(): readonly DocumentModel[] {
    return this.getEditors().map((editor) => editor.getDocument());
  }
  /**
   * Looks up a constructed editor without acquiring a consumer reference.
   *
   * @param documentId - Requested document identity.
   * @returns The editor, or undefined before construction, while closing, or when absent.
   */
  getEditor(documentId: string): ReactEditorApi | undefined {
    const entry = this.entries.get(documentId);
    return entry?.closing ? undefined : entry?.editor;
  }
  /**
   * Looks up a loaded model without acquiring a consumer reference.
   *
   * @param documentId - Requested document identity.
   * @returns The model, or undefined without a usable editor.
   */
  getDocument(documentId: string): DocumentModel | undefined {
    return this.getEditor(documentId)?.getDocument();
  }

  /**
   * Retains a model/editor for one independent consumer until its release callback.
   * Cancellation while awaiting loading releases only this consumer; another
   * consumer's load continues. After fulfillment the caller must invoke release();
   * aborting the signal alone does not release a completed acquisition.
   * @param documentId - Identity to acquire.
   * @param options - Optional consumer cancellation signal.
   * @returns Editor, model, and independently idempotent release.
   * @throws On cancellation, shutdown, or document loading failure.
   */
  async acquireEditor(
    documentId: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<EditorAcquisition> {
    options.signal?.throwIfAborted();
    const onError = this.onError;
    const entry = await this.getEntry(documentId);
    if (entry.closing) {
      return this.acquireEditor(documentId, options);
    }
    entry.consumers += 1;
    const release = createAcquisitionRelease(() => {
      entry.consumers -= 1;
      return entry.consumers === 0 ? this.close(documentId, entry) : Promise.resolve();
    });
    try {
      const editor = await waitWithAbort(entry.pending, options.signal);
      options.signal?.throwIfAborted();
      this.assertActive();
      return { editor, document: editor.getDocument(), release };
    } catch (error) {
      void release().catch((failure) => (onError ?? console.error)(failure));
      throw error;
    }
  }

  /**
   * Disposes the registry subscription, resolver, and all owned editor models.
   *
   * All cleanup is attempted even when a registry or resolver disposer fails.
   * Host callbacks are released after document cleanup settles.
   *
   * @returns Idempotent shutdown promise; all models are disposed even if one model cleanup fails.
   * @throws AggregateError if any cleanup fails.
   */
  destroy(): Promise<void> {
    if (this.destruction) {
      return this.destruction;
    }
    this.destroyed = true;
    this.destruction = Promise.resolve().then(async () => {
      const errors: unknown[] = [];
      for (const cleanup of [this.unsubscribeRegistry, () => this.blockReferences.destroy()]) {
        try {
          cleanup?.();
        } catch (error) {
          errors.push(error);
        }
      }
      this.unsubscribeRegistry = undefined;
      const results = await Promise.allSettled(
        [...this.entries].map(([id, entry]) => this.close(id, entry)),
      );
      this.documentListeners.clear();
      this.onError = undefined;
      this.openDocument = undefined;
      this.createEditor = undefined;
      errors.push(
        ...results.flatMap((result) => (result.status === "rejected" ? [result.reason] : [])),
      );
      if (errors.length) {
        throw new AggregateError(errors, "Editor storage teardown failed");
      }
    });
    return this.destruction;
  }

  /**
   * Finds or starts a shared opening entry, waiting for teardown before reopening.
   *
   * @param id - Nonempty document identity.
   * @returns The existing or newly created entry after any previous close finishes.
   * @throws If storage is destroyed, the ID is empty, or a previous close fails.
   */
  private async getEntry(id: string): Promise<Entry> {
    this.assertActive();
    if (!id.trim()) {
      throw new Error("Document ID is required");
    }
    let entry = this.entries.get(id);
    if (entry?.closing) {
      await entry.closing;
      return this.getEntry(id);
    }
    if (!entry) {
      entry = { consumers: 0, pending: Promise.resolve().then(() => this.load(id, entry!)) };
      this.entries.set(id, entry);
      void entry.pending.catch(() => {
        if (this.entries.get(id) === entry && !entry?.closing) {
          this.entries.delete(id);
        }
      });
    }
    return entry;
  }

  /**
   * Transfers a loaded model into a fixed core and creates its React runtime.
   *
   * Setup failures attempt to dispose every created resource.
   *
   * @param id - Requested document identity.
   * @param entry - Shared entry that receives the created core and runtime.
   * @returns The configured runtime after document listeners are notified.
   * @throws If loading, setup, notification, or cleanup fails; multiple failures are aggregated.
   */
  private async load(id: string, entry: Entry): Promise<ReactEditorApi> {
    let document: DocumentModel | undefined;
    let editor: ReactEditorApi | undefined;
    try {
      const openDocument = this.openDocument;
      const createEditor = this.createEditor;
      if (!openDocument || !createEditor) {
        throw new Error("Editor storage is destroyed");
      }
      document = await openDocument(id);
      if (document.id !== id) {
        throw new Error(`Expected document ${id}, received ${document.id}`);
      }
      this.assertActive();
      entry.core = createDocumentEditor({ document });
      editor = createEditor(entry.core);
      entry.editor = editor;
      if (editor.getDocument() !== document || editor.blocks !== entry.core.blocks) {
        throw new Error("Editor factory must bind the supplied core");
      }
      this.notifyDocuments();
      return editor;
    } catch (error) {
      entry.editor = undefined;
      const errors: unknown[] = [error];
      for (const cleanup of [
        () => editor?.destroy(),
        () => entry.core?.destroy(),
        () => document?.destroy(),
      ]) {
        try {
          await cleanup();
        } catch (failure) {
          errors.push(failure);
        }
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, "Editor setup and cleanup failed");
      }
      throw error;
    }
  }

  /**
   * Closes an entry once, including a pending load, and removes it after disposal.
   *
   * @param id - Document identity used to remove the matching entry.
   * @param entry - Entry whose runtime, core, and model are owned by storage.
   * @returns The shared close promise, resolved after cleanup and notification.
   * @throws If disposal or document-change notification fails; disposal failures are aggregated.
   */
  private close(id: string, entry: Entry): Promise<void> {
    if (entry.closing) {
      return entry.closing;
    }
    entry.closing = (async () => {
      try {
        let editor: ReactEditorApi;
        try {
          editor = await entry.pending;
        } catch {
          return;
        }
        const errors: unknown[] = [];
        for (const action of [
          () => editor.destroy(),
          () => entry.core!.destroy(),
          () => editor.getDocument().destroy(),
        ]) {
          try {
            await action();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length) {
          throw new AggregateError(errors, `Closing document ${id} failed`);
        }
      } finally {
        if (this.entries.get(id) === entry) {
          this.entries.delete(id);
        }
        this.notifyDocuments();
      }
    })();
    this.notifyDocuments();
    return entry.closing;
  }
  /**
   * Publishes a document lifecycle or registry metadata change to subscribers.
   *
   * @returns Current document listeners have been notified.
   * @throws If a listener throws.
   */
  private notifyDocuments(): void {
    this.documentListeners.emit("changed");
  }
  /**
   * Rejects operations after shutdown starts.
   *
   * @returns Storage is still active.
   * @throws If shutdown has started.
   */
  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("Editor storage is destroyed");
    }
  }
}
