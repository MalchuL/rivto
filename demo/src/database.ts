import type { CRDTDoc, CRDTMap, CRDTObserveEvent } from "@chulane/crdt-doc";
import {
  DocumentBlockManager, DocumentElementManager,
  DocumentModelImpl,
  type BlockInput, type BlockNode, type DocumentElement, type ElementInput,
} from "@chulane/document-model";

type EntityKind = "block" | "element";
interface IndexedRecord { kind: EntityKind; documentId: string; id: string; present: boolean; }

/**
 * Session database used by the demo. Record IDs share a namespace within each document.
 * Documents retain CRDT updates so reopening preserves collaborative container identity.
 * Block and element rows are updated individually; text edits never serialize a forest.
 * This synchronous implementation stands in for an application's local database.
 */
export class DemoDatabase {
  readonly documents = new Map<string, { updates: Uint8Array[] }>();
  readonly blocks = new Map<string, Map<string, BlockNode>>();
  readonly elements = new Map<string, Map<string, DocumentElement>>();
  private readonly identities = new Map<string, EntityKind>();
  private readonly listeners = new Set<() => void>();
  private readonly index?: CRDTMap<Record<string, IndexedRecord>>;

  /**
   * @param registry - Optional workspace metadata CRDT used to share document-qualified IDs and block locations across demo clients.
   * Record contents and saved updates remain in this session database; acquiring a document connects its content provider.
   */
  constructor(private readonly registry?: CRDTDoc) {
    this.index = registry?.getMap("demo.database.identities");
    this.index?.observe(() => this.listeners.forEach((listener) => listener()));
  }

  /** @param documentId - Allocating document. @returns A locally unused candidate ID; creation reserves it before CRDT writes. */
  createId(documentId: string): string {
    let id = crypto.randomUUID();
    while (this.hasId(documentId, id)) id = crypto.randomUUID();
    return id;
  }

  /** @param documentId - Record's document. @param id - Candidate identity. @returns Whether this document has reserved it, including deleted records. */
  hasId(documentId: string, id: string): boolean {
    const key = JSON.stringify([documentId, id]);
    return this.identities.has(key) || Boolean(this.index?.has(key));
  }

  /** @param id - Existing document identity to open, or a fresh identity to register. @returns Nothing; records in other documents may use this same ID. */
  openDocument(id: string): void {
    if (!this.documents.has(id)) this.documents.set(id, { updates: [] });
  }

  /** @param crdt - Fresh adapter restored before providers and model observers attach. @returns Nothing after replaying saved collaborative updates. */
  restore(crdt: CRDTDoc): void {
    this.openDocument(crdt.id);
    this.documents.get(crdt.id)!.updates.forEach((update) => crdt.applySnapshot(update));
  }

  /** @param documentId - Open document identity. @param update - Adapter-native incremental update. @returns Nothing after copying the update for later replay. */
  saveUpdate(documentId: string, update: Uint8Array): void {
    // ponytail: the session log grows with edits; a durable database can compact updates at checkpoints.
    this.documents.get(documentId)!.updates.push(new Uint8Array(update));
  }

  /** @param documentId - Document whose row changed. @param id - Stable block ID. @param node - Current own fields, or undefined on deletion. @returns Nothing after updating this one row and its lookup membership. */
  saveBlock(documentId: string, id: string, node?: BlockNode): void {
    this.saveRecord(this.blocks, "block", documentId, id, node);
  }

  /** @param documentId - Document whose row changed. @param id - Stable element ID. @param element - Current element, or undefined on deletion. @returns Nothing after updating this one row. */
  saveElement(documentId: string, id: string, element?: DocumentElement): void {
    this.saveRecord(this.elements, "element", documentId, id, element);
  }

  /**
   * Finds sources even when their documents are closed, without loading document content.
   * @param blockId - Document-local reference target, potentially present in several documents.
   * @returns Containing document IDs in sorted order, or an empty list when absent.
   */
  findDocumentIdsWithBlock(blockId: string): string[] {
    if (!this.index) return [...(this.blocks.get(blockId)?.keys() ?? [])].sort();
    // ponytail: fallback scans metadata; a durable database uses an index on block_id.
    return [...this.index.values()].filter((row) => row.kind === "block" && row.id === blockId && row.present)
      .map((row) => row.documentId).sort();
  }

  /** @param listener - Block membership observer; text edits do not notify it. @returns Unsubscribe callback. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Registers an identity batch before any collaborative record is written.
   * Existing same-kind identities are retained, and fresh IDs are reserved together.
   * Every identity is checked before the first write; registry updates share one transaction.
   * @param documentId - Document containing the records; other documents have independent namespaces.
   * @param kind - Record kind sharing this document's namespace.
   * @param ids - Nonempty identities to allocate or reuse; repeats in one batch are rejected.
   * @returns Nothing after preserving existing allocations and reserving fresh deterministic IDs.
   * @throws If an ID is empty, repeated, or already belongs to another record kind in this document.
   */
  reuse(documentId: string, kind: EntityKind, ...ids: string[]): void {
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate identity ID");
    ids.forEach((id) => {
      const key = JSON.stringify([documentId, id]);
      const existing = this.identities.get(key) ?? this.index?.get(key)?.kind;
      if (!id.trim() || existing && existing !== kind) throw new Error(`ID ${id} cannot be reused as a ${kind}`);
    });
    const write = () => ids.forEach((id) => this.recordIdentity(documentId, kind, id));
    if (this.registry) this.registry.transact(write);
    else write();
  }

  private recordIdentity(documentId: string, kind: EntityKind, id: string): void {
    const key = JSON.stringify([documentId, id]);
    const existing = this.identities.get(key) ?? this.index?.get(key)?.kind;
    if (existing && existing !== kind) throw new Error(`ID ${id} belongs to a ${existing}`);
    this.identities.set(key, kind);
    if (this.index && !this.index.has(key)) this.index.set(key, { kind, documentId, id, present: false });
  }

  private saveRecord<T>(table: Map<string, Map<string, T>>, kind: EntityKind, documentId: string, id: string, value?: T): void {
    let records = table.get(id);
    const present = records?.has(documentId) ?? false;
    if (value) {
      this.recordIdentity(documentId, kind, id);
      if (!records) { records = new Map(); table.set(id, records); }
      records.set(documentId, structuredClone(value));
    } else {
      records?.delete(documentId);
      if (!records?.size) table.delete(id);
    }
    if (kind === "block" && present !== Boolean(value)) {
      const key = JSON.stringify([documentId, id]);
      const indexed = this.index?.get(key);
      if (indexed && indexed.present !== Boolean(value)) this.index!.set(key, { ...indexed, present: Boolean(value) });
      if (!this.index) this.listeners.forEach((listener) => listener());
    }
  }
}

class DBBlockManager extends DocumentBlockManager {
  private readonly changedIds = new Set<string>();
  constructor(crdt: CRDTDoc, private readonly getDatabase: () => DemoDatabase, private readonly documentId = crdt.id) { super(crdt); }
  protected override generateId(): string { return this.getDatabase().createId(this.documentId); }
  protected override prepareBlock(block: BlockInput): BlockInput {
    const ids: string[] = [];
    const prepare = (input: BlockInput): BlockInput => {
      const id = input.id ?? this.generateId();
      ids.push(id);
      return { ...input, id, children: input.children?.map(prepare) };
    };
    const prepared = prepare(block);
    this.getDatabase().reuse(this.documentId, "block", ...ids);
    return prepared;
  }
  protected override onRecordsChanged(events: readonly CRDTObserveEvent[], transaction: unknown): ReadonlySet<string> {
    const ids = super.onRecordsChanged(events, transaction);
    ids.forEach((id) => this.changedIds.add(id));
    return ids;
  }
  /** @returns Nothing after persisting changed rows once all hierarchy observers have finished. */
  flushChanges(): void {
    const ids = [...this.changedIds];
    this.changedIds.clear();
    ids.forEach((id) => this.getDatabase().saveBlock(this.documentId, id, this.getBlockNode(id)));
  }

}

class DBElementManager extends DocumentElementManager {
  constructor(crdt: CRDTDoc, private readonly getDatabase: () => DemoDatabase, private readonly documentId = crdt.id) { super(crdt); }
  protected override generateId(): string { return this.getDatabase().createId(this.documentId); }
  protected override prepareElement(input: ElementInput): ElementInput {
    this.getDatabase().reuse(this.documentId, "element", input.id!);
    return input;
  }
  protected override onRecordsChanged(events: readonly CRDTObserveEvent[], transaction: unknown): ReadonlySet<string> {
    const ids = super.onRecordsChanged(events, transaction);
    ids.forEach((id) => this.getDatabase().saveElement(this.documentId, id, this.getElement(id)));
    return ids;
  }
}

/**
 * Application model using the demo database for identity creation and persistence.
 * Restores native collaborative updates before manager construction and provider attachment.
 * Rendering continues to read synchronous model snapshots; the database is never queried by blocks.
 */
export class DBDocumentModel extends DocumentModelImpl {
  private readonly unsubscribeDatabase: () => void;
  /** @param crdt - Fresh collaborative document. @param database - Shared application database holding documents and the document-local ID namespaces. */
  constructor(crdt: CRDTDoc, private readonly database: DemoDatabase) {
    database.restore(crdt);
    super(crdt);
    this.unsubscribeDatabase = crdt.on("update", (update: Uint8Array) => {
      (this.blocks as DBBlockManager).flushChanges();
      database.saveUpdate(this.id, update);
    });
  }

  /** Creates storage with deferred database access because base construction precedes database-field initialization. */
  protected override createBlockManager(crdt: CRDTDoc): DocumentBlockManager {
    return new DBBlockManager(crdt, () => this.database);
  }

  /** Creates element storage with the same deferred application dependency as block storage. */
  protected override createElementManager(crdt: CRDTDoc): DocumentElementManager {
    return new DBElementManager(crdt, () => this.database);
  }

  /** @returns Nothing after removing database observation and releasing the model, history, and providers. */
  async destroy(): Promise<void> { this.unsubscribeDatabase(); await super.destroy(); }
}
