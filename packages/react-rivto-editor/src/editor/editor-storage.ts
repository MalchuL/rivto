import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl, type DocumentModel } from "@chulane/document-model";
import { createDocumentEditor } from "@chulane/rivto";
import { BlockReferenceResolver } from "@chulane/rivto";
import { createReactEditor } from "./react-editor";
import type { EditorAcquisition, EditorStorageOptions, Entry, ReactEditorApi } from "./types";
import { waitWithAbort } from "@chulane/rivto";
export type { BlockReference, BlockResolution } from "@chulane/rivto";

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
  private readonly documentListeners = new Set<() => void>();
  private destroyed = false;
  private destruction?: Promise<void>;
  private readonly openDocument: NonNullable<EditorStorageOptions["openDocument"]>;
  private readonly createEditor: NonNullable<EditorStorageOptions["createEditor"]>;
  private readonly unsubscribeRegistry?: () => void;

  /** @param options - Optional document loader, editor factory, and embedding lookup policy. */
  constructor(private readonly options: EditorStorageOptions = {}) {
    this.blockReferences = new BlockReferenceResolver(this, options);
    this.openDocument =
      options.openDocument ?? (async (id) => new DocumentModelImpl(new YjsDoc(id)));
    this.createEditor = options.createEditor ?? ((editor) => createReactEditor({ editor }));
    this.unsubscribeRegistry = options.subscribeDocumentIds?.(() => this.notifyDocuments());
  }

  /** @param listener - Open/close or registry observer; text edits do not notify it. @returns Cleanup. */
  subscribeDocuments(listener: () => void): () => void {
    this.documentListeners.add(listener);
    return () => {
      this.documentListeners.delete(listener);
    };
  }
  /** @returns Usable editors, excluding pending and closing entries. */
  getEditors(): readonly ReactEditorApi[] {
    return [...this.entries.values()].flatMap((entry) =>
      entry.editor && !entry.closing ? [entry.editor] : [],
    );
  }
  /** @returns Loaded models without acquiring them. */
  getDocuments(): readonly DocumentModel[] {
    return this.getEditors().map((editor) => editor.getDocument());
  }
  /** @param documentId - Requested identity. @returns Constructed editor, or undefined before construction, while closing, or absent. */
  getEditor(documentId: string): ReactEditorApi | undefined {
    const entry = this.entries.get(documentId);
    return entry?.closing ? undefined : entry?.editor;
  }
  /** @param documentId - Requested identity. @returns Loaded model, or undefined without a usable editor. */
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
    const entry = await this.getEntry(documentId);
    if (entry.closing) {
      return this.acquireEditor(documentId, options);
    }
    entry.consumers += 1;
    let released: Promise<void> | undefined;
    const release = () => {
      if (!released) {
        entry.consumers -= 1;
        released = entry.consumers === 0 ? this.close(documentId, entry) : Promise.resolve();
      }
      return released;
    };
    try {
      const editor = await waitWithAbort(entry.pending, options.signal);
      options.signal?.throwIfAborted();
      this.assertActive();
      return { editor, document: editor.getDocument(), release };
    } catch (error) {
      void release().catch((failure) => this.reportError(failure));
      throw error;
    }
  }

  /** @returns Idempotent shutdown promise; all models are disposed even if one cleanup fails. */
  destroy(): Promise<void> {
    if (this.destruction) {
      return this.destruction;
    }
    this.destroyed = true;
    this.unsubscribeRegistry?.();
    this.blockReferences.destroy();
    this.destruction = (async () => {
      const results = await Promise.allSettled(
        [...this.entries].map(([id, entry]) => this.close(id, entry)),
      );
      this.documentListeners.clear();
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (errors.length) {
        throw new AggregateError(errors, "Editor storage teardown failed");
      }
    })();
    return this.destruction;
  }

  /** Finds a shared opening entry, waiting for final teardown before reopening. */
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

  /** Transfers the loaded model into a fixed core; setup failures dispose every created resource. */
  private async load(id: string, entry: Entry): Promise<ReactEditorApi> {
    let document: DocumentModel | undefined;
    let editor: ReactEditorApi | undefined;
    try {
      document = await this.openDocument(id);
      if (document.id !== id) {
        throw new Error(`Expected document ${id}, received ${document.id}`);
      }
      this.assertActive();
      entry.core = createDocumentEditor({ document });
      editor = this.createEditor(entry.core);
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

  /** Closes an entry once, including a pending load, and removes it after disposal. */
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
  /** Publishes only document lifecycle or registry metadata changes. */
  private notifyDocuments(): void {
    this.documentListeners.forEach((listener) => listener());
  }
  /** Rejects operations after shutdown starts. */
  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("Editor storage is destroyed");
    }
  }
  /** Reports asynchronous view release failures. */
  private reportError(error: unknown): void {
    (this.options.onError ?? console.error)(error);
  }
}
