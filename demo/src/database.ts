import { Listeners } from "@chulane/rivto-utils";
import { YjsDoc, type CRDTDoc, type CRDTMap, type CRDTObserveEvent } from "@chulane/crdt-doc";
import {
  DocumentBlockManager,
  DocumentElementManager,
  DocumentModelImpl,
  type Block,
  type BlockInput,
  type BlockNode,
  type ElementNode,
  type ElementInput,
} from "@chulane/document-model";

/** Batch size at which one tree read replaces repeated block placement scans. */
const BULK_BLOCK_PERSISTENCE_THRESHOLD = 64;
/** Update count that schedules session log compaction. */
const UPDATE_COMPACTION_THRESHOLD = 100;
/** Incremental bytes that schedule session log compaction. */
const UPDATE_COMPACTION_BYTES = 1024 * 1024;
/** Session keys owned by this page, used to clean up when the session ends. */
const offloadedSessionKeys = new Set<string>();

/**
 * Removes this page's session updates when it leaves without entering the back-forward cache.
 *
 * @param event - Browser lifecycle event reporting whether the page may be restored.
 * @returns Session keys are removed when the page will not be restored.
 */
function clearSessionUpdates(event: PageTransitionEvent): void {
  if (event.persisted) {
    return;
  }
  for (const key of offloadedSessionKeys) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Session storage may be inaccessible during page shutdown.
    }
  }
  offloadedSessionKeys.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", clearSessionUpdates);
}

type EntityKind = "block" | "element";
interface IndexedRecord {
  kind: EntityKind;
  documentId: string;
  id: string;
  present: boolean;
}

/** Saved updates for one demo document, optionally held in browser session storage. */
interface DemoDocumentUpdates {
  updates: Uint8Array[];
  uncompactedBytes: number;
  offloaded?: boolean;
  rowsOffloaded?: boolean;
}

/**
 * Encodes binary updates for the synchronous session-storage API.
 *
 * @param bytes - Native collaborative update to encode.
 * @returns Base64 representation of the complete update.
 */
function encodeUpdate(bytes: Uint8Array): string {
  const nativeEncode = Reflect.get(bytes, "toBase64");
  if (typeof nativeEncode === "function") {
    return nativeEncode.call(bytes);
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

/**
 * Decodes a previously stored native collaborative update.
 *
 * @param encoded - Base64 representation written by this session.
 * @returns The original binary update.
 * @throws If the stored representation is not valid base64.
 */
function decodeUpdate(encoded: string): Uint8Array {
  const nativeDecode = Reflect.get(Uint8Array, "fromBase64");
  if (typeof nativeDecode === "function") {
    return nativeDecode.call(Uint8Array, encoded);
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Session database used by the demo. Record IDs share a namespace within each document.
 * Documents retain CRDT updates so reopening preserves collaborative container identity.
 * Block and element rows are updated individually; text edits never serialize a forest.
 * This synchronous implementation stands in for an application's local database.
 * Closed documents may move their updates to browser session storage; unavailable
 * or full storage leaves the in-memory updates intact.
 */
export class DemoDatabase {
  readonly documents = new Map<string, DemoDocumentUpdates>();
  private readonly pendingCompactions = new Map<string, () => void>();
  private readonly openModels = new Map<string, number>();
  private readonly closedBlockIds = new Map<string, Set<string>>();
  private readonly storagePrefix = `rivto-demo-${crypto.randomUUID()}:`;
  readonly blocks = new Map<string, Map<string, BlockNode>>();
  readonly elements = new Map<string, Map<string, ElementNode>>();
  private readonly identities = new Map<string, EntityKind>();
  private readonly listeners = new Listeners<{ changed: void }>();
  private registry?: CRDTDoc;
  private index?: CRDTMap<Record<string, IndexedRecord>>;
  /**
   * Removes the shared identity index observer when the database is destroyed.
   *
   * @returns The index observer is detached.
   * @throws If the underlying observer cannot be removed.
   */
  private unsubscribeIndex?: () => void;

  /**
   * Creates a session database and observes the optional shared identity index.
   *
   * Record contents and saved updates remain in this session database; acquiring
   * a document connects its content provider. The registry is borrowed and is
   * not destroyed by this database.
   *
   * @param registry - Optional workspace metadata CRDT used to share document-qualified IDs and block locations across demo clients.
   * @throws If accessing or observing the registry fails.
   */
  constructor(registry?: CRDTDoc) {
    this.registry = registry;
    this.index = registry?.getMap("demo.database.identities");
    this.unsubscribeIndex = this.index?.observe(() => this.listeners.emit("changed"));
  }

  /**
   * Generates an ID not yet reserved in the document's local namespace.
   *
   * Generating an ID does not reserve it; creation reserves it before CRDT writes.
   *
   * @param documentId - Document in which the ID will be allocated.
   * @returns A locally unused candidate ID.
   */
  createId(documentId: string): string {
    let id = crypto.randomUUID();
    while (this.hasId(documentId, id)) {
      id = crypto.randomUUID();
    }
    return id;
  }

  /**
   * Checks whether a document has reserved an identity, including deleted records.
   *
   * @param documentId - Document whose identity namespace is checked.
   * @param id - Candidate identity.
   * @returns True if the identity is reserved locally or in the shared index.
   */
  hasId(documentId: string, id: string): boolean {
    const key = JSON.stringify([documentId, id]);
    return this.identities.has(key) || Boolean(this.index?.has(key));
  }

  /**
   * Creates an empty update log for a document that is not already registered.
   *
   * Records in other documents may use the same ID.
   *
   * @param id - Existing document identity or fresh identity to register.
   * @returns The document has an update log; an existing log is unchanged.
   */
  openDocument(id: string): void {
    if (!this.documents.has(id)) {
      this.documents.set(id, { updates: [], uncompactedBytes: 0 });
    }
  }

  /**
   * Replays saved collaborative updates before providers and model observers attach.
   *
   * @param crdt - Fresh adapter receiving this document's saved state.
   * @returns Stored updates have been loaded and applied to the adapter.
   * @throws If saved browser storage is inaccessible or corrupt, or applying an update fails.
   */
  restore(crdt: CRDTDoc): void {
    this.openDocument(crdt.id);
    const record = this.documents.get(crdt.id)!;
    if (record.offloaded) {
      this.loadOffloadedUpdate(crdt.id, record);
    }
    record.updates.forEach((update) => crdt.applySnapshot(update));
  }

  /**
   * Retains one open model so another model cannot offload its live document.
   *
   * @param documentId - Identity of the document opened by the model.
   * @returns The model is counted until its corresponding release.
   */
  retainDocument(documentId: string): void {
    this.openModels.set(documentId, (this.openModels.get(documentId) ?? 0) + 1);
  }

  /**
   * Releases one model and offloads its updates when the last model closes.
   *
   * Browser storage is optional; failed compaction or storage leaves the updates in memory.
   *
   * @param documentId - Identity previously retained by an open model.
   * @returns The model count is reduced and eligible updates are moved to session storage.
   */
  releaseDocument(documentId: string): void {
    const count = this.openModels.get(documentId);
    if (count === undefined) {
      return;
    }
    if (count > 1) {
      this.openModels.set(documentId, count - 1);
      return;
    }
    this.openModels.delete(documentId);
    this.offloadUpdates(documentId);
  }

  /**
   * Copies a collaborative update and schedules idle compaction of a large log.
   *
   * Saved updates remain intact until a replacement snapshot is produced.
   *
   * @param documentId - Identity previously registered by opening or restoring the document.
   * @param update - Adapter-native incremental update copied for later replay.
   * @returns The update is stored and compaction is scheduled when needed.
   * @throws If the document is not registered or a previously offloaded update cannot be loaded.
   */
  saveUpdate(documentId: string, update: Uint8Array): void {
    const record = this.documents.get(documentId)!;
    if (record.offloaded) {
      this.loadOffloadedUpdate(documentId, record);
    }
    record.updates.push(new Uint8Array(update));
    record.uncompactedBytes += update.byteLength;
    if (
      !this.pendingCompactions.has(documentId) &&
      (record.updates.length >= UPDATE_COMPACTION_THRESHOLD ||
        (record.updates.length > 1 && record.uncompactedBytes >= UPDATE_COMPACTION_BYTES))
    ) {
      this.scheduleCompaction(documentId);
    }
  }

  /**
   * Cancels pending compaction and releases workspace metadata after models close.
   *
   * Offloaded updates are reloaded when possible before their session-storage
   * keys are removed, preserving saved state if the database remains referenced.
   *
   * @returns Scheduled callbacks, the metadata observer, and borrowed metadata references are released without changing saved updates.
   * @throws If removing the metadata observer fails.
   */
  destroy(): void {
    for (const cancel of this.pendingCompactions.values()) {
      cancel();
    }
    this.pendingCompactions.clear();
    for (const [id, record] of this.documents) {
      if (record.offloaded) {
        try {
          this.loadOffloadedUpdate(id, record);
        } catch {
          // Keep the stored update available when storage cannot be read or removed.
        }
      }
    }
    const unsubscribe = this.unsubscribeIndex;
    this.unsubscribeIndex = undefined;
    try {
      unsubscribe?.();
    } finally {
      this.index = undefined;
      this.registry = undefined;
    }
  }

  /**
   * Stores or removes one detached block row and updates its lookup membership.
   *
   * @param documentId - Document whose row changed.
   * @param id - Stable block ID.
   * @param node - Current own fields, or undefined on deletion.
   * @returns The row and its lookup membership reflect the supplied value.
   * @throws If the ID belongs to another entity kind or the value cannot be cloned.
   */
  saveBlock(documentId: string, id: string, node?: BlockNode): void {
    this.saveRecord(this.blocks, "block", documentId, id, node);
  }

  /**
   * Stores or removes one detached element row.
   *
   * @param documentId - Document whose row changed.
   * @param id - Stable element ID.
   * @param element - Current element, or undefined on deletion.
   * @returns The row reflects the supplied value.
   * @throws If the ID belongs to another entity kind or the value cannot be cloned.
   */
  saveElement(documentId: string, id: string, element?: ElementNode): void {
    this.saveRecord(this.elements, "element", documentId, id, element);
  }

  /**
   * Finds sources even when their documents are closed, without loading document content.
   * @param blockId - Document-local reference target, potentially present in several documents.
   * @returns Containing document IDs in sorted order, or an empty list when absent.
   */
  findDocumentIdsWithBlock(blockId: string): string[] {
    if (!this.index) {
      const ids = new Set(this.blocks.get(blockId)?.keys());
      for (const [documentId, blocks] of this.closedBlockIds) {
        if (blocks.has(blockId)) {
          ids.add(documentId);
        }
      }
      return [...ids].sort();
    }
    // ponytail: fallback scans metadata; a durable database uses an index on block_id.
    return [...this.index.values()]
      .filter((row) => row.kind === "block" && row.id === blockId && row.present)
      .map((row) => row.documentId)
      .sort();
  }

  /**
   * Subscribes to changes in block membership across documents.
   *
   * Text edits do not notify this listener.
   *
   * @param listener - Callback invoked when block membership changes.
   * @returns An idempotent callback that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("changed", listener);
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
    if (new Set(ids).size !== ids.length) {
      throw new Error("Duplicate identity ID");
    }
    ids.forEach((id) => {
      const key = JSON.stringify([documentId, id]);
      const existing = this.identities.get(key) ?? this.index?.get(key)?.kind;
      if (!id.trim() || (existing && existing !== kind)) {
        throw new Error(`ID ${id} cannot be reused as a ${kind}`);
      }
    });
    const write = () => ids.forEach((id) => this.recordIdentity(documentId, kind, id));
    if (this.registry) {
      this.registry.transact(write);
    } else {
      write();
    }
  }

  /**
   * Marks reconstructed rows as authoritative after a document reopens.
   *
   * @param documentId - Document whose derived rows were restored.
   * @returns Closed-document lookup state is released.
   */
  finishRestoringRows(documentId: string): void {
    for (const id of this.closedBlockIds.get(documentId) ?? []) {
      if (!this.blocks.get(id)?.has(documentId)) {
        this.saveBlock(documentId, id);
      }
    }
    this.closedBlockIds.delete(documentId);
    this.documents.get(documentId)!.rowsOffloaded = false;
  }

  /**
   * Schedules one idle compaction for the given document.
   *
   * @param documentId - Document whose session log has grown.
   * @returns An idle callback or timer is registered until it runs or is cancelled.
   */
  private scheduleCompaction(documentId: string): void {
    const compact = () => {
      this.pendingCompactions.delete(documentId);
      this.compactUpdates(documentId);
    };
    if (typeof requestIdleCallback === "function" && typeof cancelIdleCallback === "function") {
      const id = requestIdleCallback(compact, { timeout: 1_000 });
      this.pendingCompactions.set(documentId, () => cancelIdleCallback(id));
    } else {
      const id = setTimeout(compact, 0);
      this.pendingCompactions.set(documentId, () => clearTimeout(id));
    }
  }

  /**
   * Moves a closed document's compacted update into browser session storage.
   *
   * The existing in-memory log remains authoritative unless storage succeeds.
   *
   * @param documentId - Closed document whose updates can be offloaded.
   * @returns The update is offloaded when compaction and storage both succeed.
   */
  private offloadUpdates(documentId: string): void {
    const record = this.documents.get(documentId);
    if (!record || record.offloaded || record.updates.length === 0) {
      return;
    }
    this.pendingCompactions.get(documentId)?.();
    this.pendingCompactions.delete(documentId);
    try {
      this.compactUpdates(documentId);
      const key = this.storagePrefix + documentId;
      sessionStorage.setItem(key, encodeUpdate(record.updates[0]!));
      offloadedSessionKeys.add(key);
      record.updates.length = 0;
      record.uncompactedBytes = 0;
      record.offloaded = true;
      this.releaseRows(documentId);
      record.rowsOffloaded = true;
    } catch {
      // Quota, access, or invalid updates leave the in-memory log intact.
    }
  }

  /**
   * Drops reconstructible rows after their collaborative snapshot is stored.
   *
   * Block identities remain available to closed-document lookup without loading
   * the snapshot. Rows belonging to other documents are untouched.
   *
   * @param documentId - Document whose model has no remaining consumers.
   * @returns Derived rows are released and block membership is retained.
   */
  private releaseRows(documentId: string): void {
    const blockIds = new Set<string>();
    for (const [id, records] of this.blocks) {
      if (records.delete(documentId)) {
        blockIds.add(id);
      }
      if (!records.size) {
        this.blocks.delete(id);
      }
    }
    for (const [id, records] of this.elements) {
      records.delete(documentId);
      if (!records.size) {
        this.elements.delete(id);
      }
    }
    this.closedBlockIds.set(documentId, blockIds);
  }

  /**
   * Loads a stored update before a document is restored or receives another update.
   *
   * The in-memory copy becomes authoritative only after decoding succeeds.
   *
   * @param documentId - Identity of the stored document.
   * @param record - Its saved update record.
   * @returns The stored update is retained in memory and its storage key is removed when possible.
   * @throws If the stored update is missing, inaccessible, or invalid.
   */
  private loadOffloadedUpdate(documentId: string, record: DemoDocumentUpdates): void {
    const encoded = sessionStorage.getItem(this.storagePrefix + documentId);
    if (encoded === null) {
      throw new Error(`Missing saved update for ${documentId}`);
    }
    record.updates.push(decodeUpdate(encoded));
    record.offloaded = false;
    try {
      sessionStorage.removeItem(this.storagePrefix + documentId);
      offloadedSessionKeys.delete(this.storagePrefix + documentId);
    } catch {
      // The restored in-memory copy remains authoritative if removal is denied.
    }
  }

  /**
   * Replays saved updates into a temporary CRDT and replaces them with its snapshot.
   *
   * The live document and its undo history are unchanged. The old log is kept if
   * replay or encoding fails; Yjs snapshots also retain updates with missing dependencies.
   *
   * @param documentId - Document whose session log should be compacted.
   * @returns A completed snapshot replaces the saved updates.
   * @throws If an update cannot be applied or the snapshot cannot be encoded.
   */
  private compactUpdates(documentId: string): void {
    const record = this.documents.get(documentId);
    if (!record || record.updates.length < 2) {
      return;
    }
    const temporary = new YjsDoc(documentId);
    try {
      record.updates.forEach((update) => temporary.applySnapshot(update));
      const snapshot = temporary.getSnapshot();
      record.updates.splice(0, record.updates.length, snapshot);
      record.uncompactedBytes = 0;
    } finally {
      void temporary.destroy();
    }
  }

  /**
   * Records an entity's document-local identity and creates a missing index entry.
   *
   * @param documentId - Document whose identity namespace is updated.
   * @param kind - Entity kind associated with the document-local ID.
   * @param id - Stable ID of the record or registration to access.
   * @returns The identity is reserved and a missing shared index entry is created.
   * @throws If the ID was previously assigned to a different entity kind.
   */
  private recordIdentity(documentId: string, kind: EntityKind, id: string): void {
    const key = JSON.stringify([documentId, id]);
    const existing = this.identities.get(key) ?? this.index?.get(key)?.kind;
    if (existing && existing !== kind) {
      throw new Error(`ID ${id} belongs to a ${existing}`);
    }
    this.identities.set(key, kind);
    if (this.index && !this.index.has(key)) {
      this.index.set(key, { kind, documentId, id, present: false });
    }
  }

  /**
   * Stores a detached record or removes its document entry, updating block-presence indexes and listeners.
   *
   * @param table - Record table indexed by entity ID and then document ID.
   * @param kind - Entity kind associated with the document-local ID.
   * @param documentId - Document whose record is stored or removed.
   * @param id - Stable ID of the record or registration to access.
   * @param value - Record to clone into storage, or undefined to remove its document entry.
   * @returns The row and, for blocks, presence indexes and listeners are updated.
   * @throws If the identity belongs to another kind or the record cannot be cloned.
   */
  private saveRecord<T>(
    table: Map<string, Map<string, T>>,
    kind: EntityKind,
    documentId: string,
    id: string,
    value?: T,
  ): void {
    let records = table.get(id);
    const present = Boolean(
      records?.has(documentId) || this.closedBlockIds.get(documentId)?.has(id),
    );
    if (value) {
      this.recordIdentity(documentId, kind, id);
      if (!records) {
        records = new Map();
        table.set(id, records);
      }
      records.set(documentId, structuredClone(value));
    } else {
      records?.delete(documentId);
      if (kind === "block") {
        this.closedBlockIds.get(documentId)?.delete(id);
      }
      if (!records?.size) {
        table.delete(id);
      }
    }
    if (kind === "block" && present !== Boolean(value)) {
      const key = JSON.stringify([documentId, id]);
      const indexed = this.index?.get(key);
      if (indexed && indexed.present !== Boolean(value)) {
        this.index!.set(key, { ...indexed, present: Boolean(value) });
      }
      if (!this.index) {
        this.listeners.emit("changed");
      }
    }
  }
}

class DBBlockManager extends DocumentBlockManager {
  private readonly changedIds = new Set<string>();
  /**
   * Connects block persistence to the demo database for the supplied CRDT document.
   *
   * @param crdt - CRDT document backing the manager.
   * @param getDatabase - Reads the demo database used for identity allocation and record storage.
   * @param documentId - Document whose records and identities are being accessed; defaults to the CRDT document ID when omitted.
   */
  constructor(
    crdt: CRDTDoc,
    private readonly getDatabase: () => DemoDatabase,
    private readonly documentId = crdt.id,
  ) {
    super(crdt);
  }
  /**
   * Allocates a document-local block ID through the demo database.
   *
   * @returns New block ID.
   */
  protected override generateId(): string {
    return this.getDatabase().createId(this.documentId);
  }
  /**
   * Assigns missing IDs throughout the input subtree and reserves all block identities in the database.
   *
   * @param block - Block snapshot or input used by this operation.
   * @returns Prepared subtree with stable IDs.
   * @throws If an ID conflicts with another entity kind.
   */
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
  /**
   * Accumulates changed block IDs after the base manager applies CRDT observations.
   *
   * @param events - CRDT record changes in the current transaction.
   * @param transaction - Adapter transaction passed to the base manager.
   * @returns IDs changed by this transaction.
   */
  protected override onRecordsChanged(
    events: readonly CRDTObserveEvent[],
    transaction: unknown,
  ): ReadonlySet<string> {
    const ids = super.onRecordsChanged(events, transaction);
    ids.forEach((id) => this.changedIds.add(id));
    return ids;
  }
  /**
   * Persists changed rows once all hierarchy observers have finished.
   *
   * Large batches traverse the placed tree once; smaller batches read only their
   * changed nodes. Missing or unplaced records remove their database rows.
   *
   * @returns Changed block rows and lookup membership reflect the transaction.
   */
  flushChanges(): void {
    const ids = [...this.changedIds];
    this.changedIds.clear();
    if (ids.length < BULK_BLOCK_PERSISTENCE_THRESHOLD) {
      ids.forEach((id) => this.getDatabase().saveBlock(this.documentId, id, this.getBlockNode(id)));
      return;
    }
    const changed = new Set(ids);
    const nodes = new Map<string, BlockNode>();
    const pending: Block[] = this.getBlocks();
    while (pending.length) {
      const block = pending.pop()!;
      for (const child of block.children) {
        pending.push(child);
      }
      if (changed.has(block.id)) {
        const { children, ...fields } = block;
        nodes.set(block.id, { ...fields, childIds: children.map((child) => child.id) });
      }
    }
    ids.forEach((id) => this.getDatabase().saveBlock(this.documentId, id, nodes.get(id)));
  }
}

class DBElementManager extends DocumentElementManager {
  /**
   * Connects element persistence to the demo database for the supplied CRDT document.
   *
   * @param crdt - CRDT document backing the manager.
   * @param getDatabase - Reads the demo database used for identity allocation and record storage.
   * @param documentId - Document whose records and identities are being accessed; defaults to the CRDT document ID when omitted.
   */
  constructor(
    crdt: CRDTDoc,
    private readonly getDatabase: () => DemoDatabase,
    private readonly documentId = crdt.id,
  ) {
    super(crdt);
  }
  /**
   * Allocates a document-local element ID through the demo database.
   *
   * @returns New element ID.
   */
  protected override generateId(): string {
    return this.getDatabase().createId(this.documentId);
  }
  /**
   * Reserves the prepared element's identity in the demo database.
   *
   * @param input - Creation or update fields for this operation.
   * @returns The unchanged input.
   * @throws If its ID conflicts with another entity kind.
   */
  protected override prepareElement(input: ElementInput): ElementInput {
    this.getDatabase().reuse(this.documentId, "element", input.id!);
    return input;
  }
  /**
   * Writes changed element records to the demo database after processing CRDT observations.
   *
   * @param events - CRDT record changes in the current transaction.
   * @param transaction - Adapter transaction passed to the base manager.
   * @returns IDs changed by this transaction.
   */
  protected override onRecordsChanged(
    events: readonly CRDTObserveEvent[],
    transaction: unknown,
  ): ReadonlySet<string> {
    const ids = super.onRecordsChanged(events, transaction);
    ids.forEach((id) =>
      this.getDatabase().saveElement(this.documentId, id, this.getElementNode(id)),
    );
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
  private database?: DemoDatabase;
  /**
   * Restores a document and starts persisting its subsequent collaborative updates.
   *
   * Previously offloaded rows are reconstructed from the restored document.
   * The database is borrowed and is released when this model is destroyed.
   *
   * @param crdt - Fresh collaborative document to restore and own.
   * @param database - Shared session database holding updates and document-local identity namespaces.
   * @throws If restoration, model construction, persistence, or observation fails.
   */
  constructor(crdt: CRDTDoc, database: DemoDatabase) {
    const restoreRows = database.documents.get(crdt.id)?.rowsOffloaded === true;
    database.restore(crdt);
    super(crdt);
    this.database = database;
    if (restoreRows) {
      this.restoreRows(database);
    }
    // Persist initialization too: later incremental updates depend on its CRDT clock.
    database.saveUpdate(this.id, crdt.getSnapshot());
    this.unsubscribeDatabase = crdt.on("update", (update: Uint8Array) => {
      (this.blocks as DBBlockManager).flushChanges();
      database.saveUpdate(this.id, update);
    });
    database.retainDocument(this.id);
  }

  /**
   * Creates block storage with deferred access to the borrowed database.
   *
   * Base construction precedes database-field initialization.
   *
   * @param crdt - Collaborative document backing the block manager.
   * @returns A block manager that reads the database when its operations need it.
   */
  protected override createBlockManager(crdt: CRDTDoc): DocumentBlockManager {
    return new DBBlockManager(crdt, () => this.requireDatabase());
  }

  /**
   * Creates element storage with deferred access to the borrowed database.
   *
   * Base construction precedes database-field initialization, as with block storage.
   *
   * @param crdt - Collaborative document backing the element manager.
   * @returns An element manager that reads the database when its operations need it.
   */
  protected override createElementManager(crdt: CRDTDoc): DocumentElementManager {
    return new DBElementManager(crdt, () => this.requireDatabase());
  }

  /**
   * Releases the model, history, providers, and database observation.
   *
   * Database observation remains active during provider disconnection so final
   * updates are saved. The borrowed database reference is released even if teardown fails.
   * The database may offload updates after the last model of this document closes.
   *
   * @returns A promise resolved after model cleanup completes.
   * @throws If subscription removal or model cleanup fails.
   */
  async destroy(): Promise<void> {
    try {
      await super.destroy();
    } finally {
      try {
        this.unsubscribeDatabase();
      } finally {
        const database = this.database;
        this.database = undefined;
        database?.releaseDocument(this.id);
      }
    }
  }

  /**
   * Reconstructs demo database projections from the reopened collaborative state.
   *
   * @param database - Database that owns the previously offloaded rows.
   * @returns Current block and element rows are stored and closed lookup state is released.
   */
  private restoreRows(database: DemoDatabase): void {
    const pending = [...this.blocks.getBlocks()];
    while (pending.length) {
      const block = pending.pop()!;
      pending.push(...block.children);
      const { children, ...fields } = block;
      database.saveBlock(this.id, block.id, {
        ...fields,
        childIds: children.map((child) => child.id),
      });
    }
    for (const element of this.elements.getElementNodes()) {
      database.saveElement(this.id, element.id, element);
    }
    database.finishRestoringRows(this.id);
  }

  /**
   * Reads the database borrowed by the live document managers.
   *
   * @returns The session database used for record persistence.
   * @throws If document teardown has completed.
   */
  private requireDatabase(): DemoDatabase {
    if (!this.database) {
      throw new Error("Demo document is destroyed");
    }
    return this.database;
  }
}
