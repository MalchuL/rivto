import {
  CRDTType,
  BasicType,
  CRDTArray,
  CRDTDoc,
  CRDTMap,
  CRDTText,
  CRDTUndoManager,
  CRDTUndoScope,
  Unsubscribe,
  Provider,
  ProviderCleanup,
  WrapBasicTypeToCRDTOptions,
} from "../types";
import * as utils from "./structures/utils";
import * as Y from "yjs";
import { Storage } from "../utils";
import { YjsArray, YjsMap, YjsText } from "./structures";
import { YjsUndoManager } from "./yjs-undo-manager";
import type { YJSType } from "./structures/utils/types";

/** One provider connection and its shared, possibly pending disconnection. */
interface ProviderAttachment {
  /** Provider ID captured when this attachment was registered. */
  readonly id: string;
  /** Provider connected by this attachment. */
  readonly provider: Provider;
  /** Connection completion shared with any pending disconnection. */
  readonly connecting: Promise<void>;
  /** Shared in-flight disconnection; cleared after failure to allow retry. */
  disconnecting?: Promise<void>;
  /**
   * Drops the caller's cleanup reference to this attachment after detachment.
   *
   * @returns The cleanup no longer retains the disconnect operation.
   */
  releaseCleanup?: () => void;
}

/**
 * Creates a provider cleanup and a way for its owner to release it on detach.
 *
 * The operation remains available after a failed disconnect so it can be retried.
 *
 * @param disconnect - Disconnects the exact provider attachment.
 * @returns The caller's cleanup and the owner's reference-release operation.
 * The cleanup rejects if the supplied disconnection fails.
 */
function createProviderCleanup(
  disconnect: () => Promise<void>,
): readonly [ProviderCleanup, () => void] {
  let operation: (() => Promise<void>) | undefined = disconnect;
  return [
    async () => {
      if (operation) {
        await operation();
      }
    },
    () => {
      operation = undefined;
    },
  ];
}

/** Adapts one owned Yjs document to the collaborative document interface. */
export class YjsDoc implements CRDTDoc {
  private nativeDocument: Y.Doc | undefined;
  private destruction?: Promise<void>;
  private transactionDepth = 0;
  private readonly localOrigin = Symbol("yjs-doc-local");
  /**
   * Provider attachments keyed by their stable provider IDs.
   */
  private readonly providerAttachments = new Storage<ProviderAttachment>();
  /**
   * Creates an adapter that owns the supplied Yjs document or a new one.
   *
   * The adapter destroys its native document after disconnecting providers.
   *
   * @param documentId - Stable identity exposed by this adapter.
   * @param doc - Native document to wrap; defaults to a new Yjs document.
   */
  constructor(
    private readonly documentId: string,
    doc?: Y.Doc,
  ) {
    this.nativeDocument = doc || new Y.Doc();
  }

  /**
   * Exposes the native document until provider disconnection completes.
   *
   * A caller retaining the returned document owns that reference independently.
   *
   * @returns The native Yjs document owned by this adapter.
   * @throws If adapter destruction has completed.
   */
  get doc(): Y.Doc {
    if (!this.nativeDocument) {
      throw new Error("Yjs document is destroyed");
    }
    return this.nativeDocument;
  }

  /**
   * Whether this adapter is currently executing or publishing a CRDT transaction.
   *
   * True from the start of `transact()` until it returns, including nested
   * transacts and while observers/`update` events fire. Storage readers skip
   * snapshot caches and read live CRDT state in this window because the tree
   * can still be half-written.
   *
   * This is the CRDT write window, not an undo-grouping flag. Direct
   * document-model mutations transact without opening a history batch.
   *
   * @returns True while adapter code is inside `transact()`.
   */
  get isTransacting(): boolean {
    return this.transactionDepth > 0;
  }

  /**
   * Reports whether an observed transaction used this adapter's private local tag.
   * @param origin - Origin received from a Yjs update event.
   * @returns Whether the origin represents a default local transaction.
   */
  isLocalOrigin(origin: unknown): boolean {
    return origin === this.localOrigin;
  }

  /**
   * Creates a detached Yjs array for insertion into an attached CRDT container.
   *
   * This does not create a named root. Attach the result to a parent obtained
   * with `getMap()` or `getArray()` using `set()`, `push()`, or `insert()`.
   * Most reads throw until attachment.
   *
   * @returns A detached array compatible with this Yjs document.
   */
  createDetachedArray<Item extends CRDTType = CRDTType>(): CRDTArray<Item> {
    return new YjsArray<Item>();
  }

  /**
   * Creates a detached Yjs map for insertion into an attached CRDT container.
   *
   * This does not create a named root. Attach the result to a parent obtained
   * with `getMap()` or `getArray()` using `set()`, `push()`, or `insert()`.
   * Most reads throw until attachment.
   *
   * @returns A detached map compatible with this Yjs document.
   */
  createDetachedMap<Schema extends object = Record<string, CRDTType>>(): CRDTMap<Schema> {
    return new YjsMap<Schema>();
  }

  /**
   * Creates detached Yjs text for insertion into an attached CRDT container.
   *
   * This does not create a named root. Attach the result to a parent obtained
   * with `getMap()` or `getArray()` using `set()`, `push()`, or `insert()`.
   * Reads throw until attachment.
   *
   * @returns Detached text compatible with this Yjs document.
   */
  createDetachedText(): CRDTText {
    return new YjsText();
  }

  /**
   * Attaches a provider to the YjsDoc.
   *
   * The returned cleanup belongs to this attachment even if its ID is reused.
   * Disconnecting or destroying waits for an in-flight connection to settle.
   *
   * @param provider - The provider to attach.
   * @returns A promise resolving to cleanup that disconnects this exact attachment.
   * @throws If destruction has started, the ID is in use, or connection fails.
   */
  async attachProvider(provider: Provider): Promise<ProviderCleanup> {
    if (this.destruction) {
      throw new Error("YjsDoc is destroyed");
    }
    const id = provider.id;
    if (this.providerAttachments.hasItem(id)) {
      throw new Error(`Provider with id ${id} is already attached`);
    }
    let resolveConnection!: () => void;
    let rejectConnection!: (error: unknown) => void;
    const connecting = new Promise<void>((resolve, reject) => {
      resolveConnection = resolve;
      rejectConnection = reject;
    });
    const attachment: ProviderAttachment = { id, provider, connecting };
    this.providerAttachments.setItem(id, attachment);
    // Register first so reentrant teardown can wait for this connection.
    try {
      Promise.resolve(provider.connect(this)).then(resolveConnection, rejectConnection);
    } catch (error) {
      rejectConnection(error);
    }
    try {
      await attachment.connecting;
    } catch (error) {
      if (
        this.providerAttachments.hasItem(id) &&
        this.providerAttachments.getItem(id) === attachment
      ) {
        this.providerAttachments.removeItem(id);
      }
      throw error;
    }
    if (
      !this.providerAttachments.hasItem(id) ||
      this.providerAttachments.getItem(id) !== attachment
    ) {
      return async () => {};
    }
    const [cleanup, release] = createProviderCleanup(async () => {
      if (
        this.providerAttachments.hasItem(id) &&
        this.providerAttachments.getItem(id) === attachment
      ) {
        await this.disconnectProvider(attachment);
      }
    });
    attachment.releaseCleanup = release;
    return cleanup;
  }

  /**
   * Detaches a provider from the YjsDoc.
   * @param id - Optional provider ID, required when multiple providers are attached.
   * @returns A promise resolving when the provider is disconnected and unregistered.
   * @throws If the ID is missing or ambiguous, or disconnection fails.
   */
  async detachProvider(id?: string): Promise<void> {
    const attachment =
      id === undefined ? this.providerAttachments.getOne() : this.providerAttachments.getItem(id);
    await this.disconnectProvider(attachment);
  }

  /**
   * Executes a transaction on the YjsDoc.
   * @param fn - The function to execute within the transaction.
   * @param origin - Optional explicit origin; defaults to this adapter's private local origin.
   * @returns No value.
   */
  transact(fn: () => void, origin?: unknown): void {
    this.transactionDepth += 1;
    try {
      this.doc.transact(fn, origin === undefined ? this.localOrigin : origin);
    } finally {
      this.transactionDepth -= 1;
    }
  }

  /**
   * Creates an undo/redo manager for the provided CRDT scopes using Yjs UndoManager.
   *
   * The method unwraps the CRDT scopes into native Yjs types and creates a `Y.UndoManager`
   * that tracks changes only within those scopes. Changes are filtered by `trackedOrigins`:
   * only transactions whose origin is included in the provided set will be recorded in the
   * undo/redo history.
   *
   * A positive limit schedules eviction during browser idle time, or with a timer
   * when idle callbacks are unavailable. Pending eviction is completed before
   * undo or redo. Evicted content can remain in the Yjs document until reload.
   * Destroying the history or document releases this adapter's native manager;
   * subsequent history operations throw.
   *
   * @param scopes - The list of CRDT scopes to track for undo/redo operations.
   * @param trackedOrigins - Optional origin objects to track instead of the private local origin.
   * @param maxEntries - Maximum entries per undo or redo stack; zero disables capture and undefined leaves them unlimited.
   * @returns A `CRDTUndoManager` instance with `undo`, `redo`, `clear`, `stopCapturing`, and `destroy` methods.
   * @throws If the maximum is not a non-negative integer.
   */
  createUndoManager(
    scopes: CRDTUndoScope[],
    trackedOrigins?: unknown[],
    maxEntries?: number,
  ): CRDTUndoManager {
    if (maxEntries !== undefined && (!Number.isInteger(maxEntries) || maxEntries < 0)) {
      throw new RangeError("History limit must be a non-negative integer");
    }
    const nativeScopes = scopes.map((scope) => utils.unwrapCRDTtoYJS(scope) as Y.AbstractType<any>);
    const manager = new Y.UndoManager(nativeScopes, {
      trackedOrigins: new Set(trackedOrigins ?? [this.localOrigin]),
      // Prevent this history from setting Yjs keep flags when no undo steps can be retained.
      captureTransaction: maxEntries === 0 ? () => false : undefined,
    });
    return new YjsUndoManager(manager, maxEntries);
  }

  /**
   * Gets or creates a named root array in the Yjs document.
   *
   * The returned wrapper retains its native shared type and document independently
   * of this adapter. Release the wrapper when it is no longer needed.
   *
   * @param path - Name of the root array.
   * @returns A wrapper around the named native array.
   * @throws If the document is destroyed or the root has an incompatible type.
   */
  getArray<Item extends CRDTType = CRDTType>(path: string): CRDTArray<Item> {
    return utils.wrapYJStoCRDT(this.doc.getArray(path)) as CRDTArray<Item>;
  }

  /**
   * Gets or creates a named root map in the Yjs document.
   *
   * The returned wrapper retains its native shared type and document independently
   * of this adapter. Release the wrapper when it is no longer needed.
   *
   * @param path - Name of the root map.
   * @returns A wrapper around the named native map.
   * @throws If the document is destroyed or the root has an incompatible type.
   */
  getMap<Schema extends object = Record<string, CRDTType>>(path: string): CRDTMap<Schema> {
    return utils.wrapYJStoCRDT(this.doc.getMap(path)) as CRDTMap<Schema>;
  }

  /**
   * Gets or creates named root text in the Yjs document.
   *
   * The returned wrapper retains its native shared type and document independently
   * of this adapter. Release the wrapper when it is no longer needed.
   *
   * @param path - Name of the root text.
   * @returns A wrapper around the named native text.
   * @throws If the document is destroyed or the root has an incompatible type.
   */
  getText(path: string): CRDTText {
    return utils.wrapYJStoCRDT(this.doc.getText(path)) as CRDTText;
  }

  /**
   * Subscribes to a document event.
   *
   * The returned function releases its references on the first call, including
   * after the native document has been destroyed.
   *
   * @param event - Native Yjs update or sync event to observe.
   * @param handler - Callback invoked with the event's native arguments.
   * @returns An idempotent unsubscribe that releases its document and listener references.
   * @throws If the document has already been destroyed or native registration fails.
   */
  on(event: "update" | "sync", handler: (event: any) => void): Unsubscribe {
    this.doc.on(event, handler);
    let subscription: [YjsDoc, typeof handler] | undefined = [this, handler];
    return () => {
      if (subscription) {
        const [adapter, listener] = subscription;
        subscription = undefined;
        adapter.nativeDocument?.off(event, listener);
      }
    };
  }

  /**
   * Encodes the current Yjs state as a collaborative update.
   *
   * @returns A binary update that can be applied to another Yjs document.
   * @throws If the document has been destroyed or encoding fails.
   */
  getSnapshot(): any {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Applies a Yjs update to the current collaborative document.
   *
   * @param snapshot - Update bytes accepted by the Yjs update decoder.
   * @returns The update has been applied and any resulting observers have run.
   * @throws If the document has been destroyed or the update cannot be applied.
   */
  applySnapshot(snapshot: any): void {
    Y.applyUpdate(this.doc, new Uint8Array(snapshot));
  }

  /**
   * Disconnects attached providers before destroying the native document.
   *
   * Pending connections settle before disconnection. Repeated calls share one
   * teardown, and the document remains available to providers during cleanup.
   *
   * @returns A promise resolving after all provider and document cleanup completes.
   * @throws If native destruction fails, or a provider disconnection fails after cleanup is attempted.
   */
  destroy(): Promise<void> {
    if (this.destruction) {
      return this.destruction;
    }
    this.destruction = Promise.resolve().then(async () => {
      const document = this.doc;
      const attachments = this.providerAttachments.values();
      const results = await Promise.allSettled(
        attachments.map((attachment) => this.disconnectProvider(attachment)),
      );
      for (const attachment of attachments) {
        attachment.releaseCleanup?.();
        attachment.releaseCleanup = undefined;
      }
      this.providerAttachments.clear();
      try {
        document.destroy();
      } finally {
        this.nativeDocument = undefined;
      }
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failure) {
        throw failure.reason;
      }
    });
    return this.destruction;
  }

  /**
   * Converts the YjsDoc to a JSON representation.
   * @returns The BasicType.
   */
  toJSON(): BasicType {
    const snapshot: Record<string, BasicType> = {};

    this.doc.share.forEach((rootType, key) => {
      const value = this.doc.get(key);
      // If the value is an AbstractType (might be in synced docs), we need to convert it to a JSON object.
      if (value.constructor.name === "AbstractType") {
        throw new Error(
          `YjsDoc.toJSON: AbstractType found in synced docs. To fix this call "doc.getMap(${key}) or doc.getText(${key}) or doc.getArray(${key})" to get the value.`,
        );
      }
      // We call toJSON to convert the type to a JSON object.
      // This is necessary because utils.convertYJSTypeToBasic can't convert object that wasn't get via getMap or other getters.
      // In such case it returns Y.AbstractType
      snapshot[key] = utils.convertYJSTypeToBasic(value as YJSType);
    });
    return snapshot;
  }

  /**
   * Replaces known root contents from a JSON representation in one Yjs transaction.
   *
   * Root values are checked before clearing existing contents. Yjs transactions
   * do not roll back mutations if a later conversion or insertion fails.
   *
   * @param json - Object or map of root names to maps, arrays, or text.
   * @param options - Options for converting nested basic values to Yjs types.
   * @returns The supplied roots have been restored and other known roots cleared.
   * @throws If root values are unsupported, the document is destroyed, or conversion fails.
   */
  fromJSON(json: BasicType, options?: WrapBasicTypeToCRDTOptions): void {
    if (json === null || typeof json !== "object") {
      throw new Error("Invalid JSON provided to YjsDoc.fromJSON");
    }
    if (Array.isArray(json)) {
      throw new Error("Invalid JSON provided to YjsDoc.fromJSON, expected an object");
    }
    const entries =
      json instanceof Map
        ? Array.from(json.entries())
        : Object.entries(json as Record<string, BasicType>);
    entries.forEach(([key, value]) => {
      if (
        !(value instanceof Map) &&
        !Array.isArray(value) &&
        typeof value !== "string" &&
        (value === null || typeof value !== "object")
      ) {
        throw new Error(`Unsupported root type for key "${key}"
                        (got ${typeof value}, value: ${JSON.stringify(value)},
                        data: ${JSON.stringify(value)})
                        when restoring YjsDoc. Entries: ${JSON.stringify(entries)}`);
      }
    });

    this.doc.transact(() => {
      // Clear collaborative contents of known typed roots. Deleting
      // `doc.share` is not a CRDT operation and is invisible to peers.
      this.doc.share.forEach((rootType, key) => this.clearTypedRoot(key));
      entries.forEach(([key, value]) => this.restoreRoot(key, value, options));
    });
  }

  /**
   * Reads the identity supplied when this adapter was constructed.
   *
   * @returns Stable document ID, including after native document destruction.
   */
  get id(): string {
    return this.documentId;
  }

  /**
   * Shares one disconnection for an attachment after its connection settles.
   *
   * Failed connections require no disconnection. A failed disconnection keeps
   * the attachment registered so an explicit later attempt can retry it.
   *
   * @param attachment - Exact provider attachment owned by this document.
   * @returns A promise resolving once the provider is disconnected or failed to connect.
   * @throws If the provider's disconnection rejects.
   */
  private disconnectProvider(attachment: ProviderAttachment): Promise<void> {
    if (attachment.disconnecting) {
      return attachment.disconnecting;
    }
    const disconnecting = (async () => {
      try {
        await attachment.connecting;
      } catch {
        return;
      }
      await attachment.provider.disconnect(this);
      if (
        this.providerAttachments.hasItem(attachment.id) &&
        this.providerAttachments.getItem(attachment.id) === attachment
      ) {
        this.providerAttachments.removeItem(attachment.id);
      }
      attachment.releaseCleanup?.();
      attachment.releaseCleanup = undefined;
    })();
    attachment.disconnecting = disconnecting.catch((error: unknown) => {
      attachment.disconnecting = undefined;
      throw error;
    });
    return attachment.disconnecting;
  }

  /**
   * Restores one validated root inside the caller's Yjs transaction.
   *
   * @param key - Shared root name to populate.
   * @param value - Validated map, array, text, or object root value.
   * @param options - Options for converting nested basic values to Yjs types.
   * @returns The supplied values have been inserted into the named root.
   * @throws If the existing root has an incompatible type or conversion fails.
   */
  private restoreRoot(key: string, value: BasicType, options?: WrapBasicTypeToCRDTOptions): void {
    if (value instanceof Map) {
      const map = this.getMap(key);
      value.forEach((v, k) => {
        const basic = utils.wrapBasicTypeToCRDTType(v, options);
        map.set(k, basic);
      });
    } else if (Array.isArray(value)) {
      const array = this.getArray(key);
      value.forEach((v, i) => {
        const basic = utils.wrapBasicTypeToCRDTType(v, options);
        array.insert(i, basic);
      });
    } else if (typeof value === "string") {
      const text = this.getText(key);
      text.insert(0, value);
    } else if (typeof value === "object") {
      const map = this.getMap(key);
      Object.entries(value as Record<string, BasicType>).forEach(([k, v]) => {
        const basic = utils.wrapBasicTypeToCRDTType(v, options);
        map.set(k, basic);
      });
    }
  }

  /**
   * Empties one existing typed root without deleting it from the share registry.
   *
   * @param key - Shared root name to clear.
   * @returns No value.
   */
  private clearTypedRoot(key: string): void {
    const current = this.doc.get(key);
    if (current instanceof Y.Map) {
      current.clear();
    } else if (current instanceof Y.Array && current.length) {
      current.delete(0, current.length);
    } else if (current instanceof Y.Text && current.length) {
      current.delete(0, current.length);
    }
  }
}
