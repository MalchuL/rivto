import { Serializible } from "./crdt";
import { CRDTArray } from "./array";
import { CRDTMap } from "./map";
import { CRDTText } from "./text";
import { CRDTUndoManager, CRDTUndoScope } from "./undo";
import { CRDTType } from "./basic-types";
import type { Provider, ProviderCleanup } from "./provider";


/**
 * Unsubscribe is a function returned by event subscriptions,
 * which will remove the handler when called.
 */
export type Unsubscribe = () => void;
/**
 * CRDTDoc represents the top-level collaborative document.
 * Provides methods for transaction control, access to CRDT types, and events.
 */
export interface CRDTDoc extends Serializible {
    /**
     * The unique id of the document.
     */
    get id(): string;

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
     */
    get isTransacting(): boolean;

    /**
     * Reports whether an observed transaction origin belongs to this local adapter.
     * @param origin - Origin received from a collaborative update event.
     * @returns Whether the adapter assigned the origin to a default local transaction.
     */
    isLocalOrigin(origin: unknown): boolean;

    /**
     * Creates a detached CRDT array for insertion into an attached CRDT
     * container.
     *
     * This method does not create a named document root. First obtain an attached
     * parent with `getMap()` or `getArray()`, then attach the returned array with
     * `map.set()` or `array.insert()`. Most read operations throw until attachment.
     *
     * @returns A detached array compatible with this document adapter.
     */
    createDetachedArray<Item extends CRDTType = CRDTType>(): CRDTArray<Item>;

    /**
     * Creates a detached CRDT map for insertion into an attached CRDT container.
     *
     * This method does not create a named document root. First obtain an attached
     * parent with `getMap()` or `getArray()`, then attach the returned map with
     * `map.set()` or `array.insert()`. Most read operations throw until attachment.
     *
     * @returns A detached map compatible with this document adapter.
     */
    createDetachedMap<Schema extends object = Record<string, CRDTType>>(): CRDTMap<Schema>;

    /**
     * Creates detached collaborative text for insertion into an attached CRDT
     * container.
     *
     * This method does not create a named document root. First obtain an attached
     * parent with `getMap()` or `getArray()`, then attach the returned text with
     * `map.set()` or `array.insert()`. Read operations throw until attachment.
     *
     * @returns Detached collaborative text compatible with this document adapter.
     */
    createDetachedText(): CRDTText;

    /**
     * Attach a real-time provider (e.g. WebSocket) for syncing updates.
     * @param provider - Provider to connect and register by its unique ID.
     * @returns Cleanup that disconnects this exact provider attachment.
     */
    attachProvider(provider: Provider): Promise<ProviderCleanup>;

    /**
     * Detach a provider, inferring it when exactly one is attached.
     * @param id - Optional provider ID, required when multiple providers are attached.
     * @returns A Promise that resolves when the provider is disconnected.
     */
    detachProvider(id?: string): Promise<void>;

    /**
     * Executes operations atomically, using the adapter's private local origin by default.
     * @param fn - Synchronous operations to execute.
     * @param origin - Optional explicit origin for foreign or specialized transactions.
     * @returns No value.
     */
    transact(fn: () => void, origin?: unknown): void;

    /**
     * Creates history for collaborative scopes, tracking the private local origin by default.
     * @param scopes - Collaborative roots included in history.
     * @param trackedOrigins - Optional explicit origins to track instead.
     * @returns Adapter-neutral undo history.
     */
    createUndoManager(scopes: CRDTUndoScope[], trackedOrigins?: unknown[]): CRDTUndoManager;

    /**
     * Get a typed CRDT-backed array at the given document path.
     */
    getArray<Item extends CRDTType = CRDTType>(path: string): CRDTArray<Item>;

    /**
     * Get a schema-typed CRDT-backed map at the given document path.
     */
    getMap<Schema extends object = Record<string, CRDTType>>(path: string): CRDTMap<Schema>;

    /**
     * Get a CRDT-backed collaborative text at the given document path.
     */
    getText(path: string): CRDTText;

    /**
     * Subscribe to real document events: `update` (local/remote change) or
     * `sync` (provider synchronization status). Snapshot restore is a method,
     * not an event.
     */
    on(event: 'update' | 'sync', handler: (event: any) => void): Unsubscribe;

    /**
     * Get a serializable snapshot of the document state.
     */
    getSnapshot(): any;

    /**
     * Apply a snapshot to restore document state.
     */
    applySnapshot(snapshot: any): void;

    /**
     * Disconnects every provider, then destroys all internal state and handlers.
     * @returns A Promise that resolves after provider and document cleanup.
     */
    destroy(): Promise<void>;
}
