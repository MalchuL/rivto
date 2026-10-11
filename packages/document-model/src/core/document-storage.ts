import type { CRDTDoc, DocumentCRDTRegistry, Provider } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "./document-model";
import { validateBlockForest } from "./managers/block-manager/utils";
import type { BlockInput, DocumentModel } from "./types";

/** Host-owned registry and provider construction. No persistence is performed. */
export interface DocumentStorageOptions {
  readonly registry: DocumentCRDTRegistry;
  /** Constructs a model before providers attach, allowing application persistence to restore CRDT state. */
  readonly createDocumentModel?: (crdt: CRDTDoc) => DocumentModel;
  /** Application search for an unloaded source. Returns its current registered document IDs; does not acquire it. The signal cancels this search request. */
  readonly lookupDocumentIds?: (blockId: string, options: { readonly signal?: AbortSignal }) => Promise<readonly string[]>;
  /** @param channel - Workspace-qualified registry or document channel. @returns Fresh provider instances for one connection. */
  readonly createProviders?: (channel: string) => readonly Provider[];
  /** Receives registry initialization and provider cleanup failures that occur outside a successful openDocument result. */
  readonly onError?: (error: unknown) => void;
}

/** Opens owned models through a lazy registry; editor consumers and model lifetimes belong to EditorStorage. */
export class DocumentStorage {
  /** Resolves after registry provider attachment; attachment is not proof of remote content arrival. */
  readonly ready: Promise<void>;
  private destroyed = false;
  private destruction?: Promise<void>;

  /** @param options - Registry, application source lookup, fresh provider factory, and optional asynchronous error reporting. */
  constructor(private readonly options: DocumentStorageOptions) {
    this.ready = this.connect(options.registry.root, options.registry.root.id).catch(async (error) => {
      await options.registry.root.destroy().catch((cleanupError) => this.reportError(cleanupError));
      throw error;
    });
    // Consumers observe the original rejected promise through openDocument/ready.
    void this.ready.catch((error) => this.reportError(error));
  }

  /** @returns Registered IDs, including documents whose session content was discarded. */
  getDocumentIds(): string[] { return this.options.registry.getDocumentIds(); }

  /**
   * Opens a registered subdocument and attaches only its providers.
   * The returned model is transferred to the caller, which must destroy it before
   * destroying this registry. Storage keeps no model cache or consumer count.
   * @param documentId - Registered identity passed to the CRDT registry.
   * @returns Fresh model after provider attachment; remote content may arrive later.
   * @throws When unknown, destroyed, or provider attachment fails.
   */
  async openDocument(documentId: string): Promise<DocumentModel> {
    await this.ready; this.assertActive();
    const crdt = this.options.registry.openDocument(documentId);
    let document: DocumentModel | undefined;
    try {
      document = this.options.createDocumentModel?.(crdt) ?? new DocumentModelImpl(crdt);
      if (document.id !== documentId) throw new Error(`Expected document ${documentId}, received ${document.id}`);
      await this.connect(crdt, JSON.stringify([this.options.registry.root.id, documentId]));
      this.assertActive();
      return document;
    } catch (error) {
      await (document ?? crdt).destroy().catch((failure) => this.reportError(failure));
      if (document && document.id !== documentId) await crdt.destroy().catch((failure) => this.reportError(failure));
      throw error;
    }
  }

  /**
   * Finds an unloaded source through the application's lookup without loading content.
   * Loaded-model lookup belongs to EditorStorage, which owns those models.
   * @param blockId - Stable embedding target identity.
   * @param options - Cancellation forwarded to the application lookup.
   * @returns Application's registered identities, or an empty list when unresolved.
   * @throws If destroyed, cancelled, or application search fails.
   */
  async findDocumentIdsWithBlock(blockId: string, options: { readonly signal?: AbortSignal } = {}): Promise<readonly string[]> {
    this.assertActive(); options.signal?.throwIfAborted();
    const ids = await this.options.lookupDocumentIds?.(blockId, options) ?? [];
    this.assertActive(); options.signal?.throwIfAborted();
    return ids;
  }

  /** @param listener - Registry metadata callback; text edits do not notify it. @returns Unsubscribe callback. */
  subscribe(listener: () => void): () => void { return this.options.registry.subscribe(listener); }

  /** @param documentId - New nonempty identity. @returns Nothing; registers metadata without loading content. */
  registerDocument(documentId: string): void { this.assertActive(); this.options.registry.registerDocument(documentId); }

  /**
   * Registers a new document and inserts its initial forest before transferring the model to its caller.
   * @param documentId - New stable identity.
   * @param blocks - Initial root forest; defaults to empty.
   * @returns Owned model, which the caller must destroy after finishing its editor consumers.
   * @throws If storage is destroyed, the ID is registered, or the initial forest is invalid.
   */
  async create(documentId: string, blocks: readonly BlockInput[] = []): Promise<DocumentModel> {
    await this.ready; this.assertActive(); validateBlockForest(blocks);
    this.registerDocument(documentId);
    const document = await this.openDocument(documentId);
    try {
      document.history.batchUpdatesWithoutHistory(() => blocks.forEach((block) => document.blocks.insertBlock(block)));
      document.history.clear();
      return document;
    } catch (error) { await document.destroy(); throw error; }
  }

  /**
   * Destroys registry metadata and its providers after the caller has closed all owned content models.
   * @returns Idempotent cleanup promise. Content-model lifetime is managed by the caller, including failed or cancelled editor acquisitions.
   */
  destroy(): Promise<void> {
    if (this.destruction) return this.destruction;
    this.destroyed = true;
    this.destruction = (async () => { await this.ready.catch(() => undefined); await this.options.registry.root.destroy(); })();
    return this.destruction;
  }

  /** Attaches fresh providers sequentially so partial failures have a deterministic cleanup owner. */
  private async connect(doc: CRDTDoc, channel: string): Promise<void> {
    for (const provider of this.options.createProviders?.(channel) ?? []) await doc.attachProvider(provider);
  }

  /** Rejects new operations after shutdown starts. */
  private assertActive(): void { if (this.destroyed) throw new Error("Document storage is destroyed"); }

  /** Reports asynchronous cleanup failures to the host. */
  private reportError(error: unknown): void { (this.options.onError ?? console.error)(error); }
}
