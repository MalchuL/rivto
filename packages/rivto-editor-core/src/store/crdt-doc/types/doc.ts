import { Serializible } from "./crdt";
import { CRDTArray } from "./array";
import { CRDTMap } from "./map";
import { CRDTText } from "./text";
import { CRDTInstantiator } from "./utils";
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
     * The instantiator for creating detached CRDT structures.
     */
    get instantiator(): CRDTInstantiator;

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
     * Execute operations within a transaction for atomicity.
     */
    transact(fn: () => void, origin?: unknown): void;

    /** Create history for the provided CRDT scopes without leaking adapter types. */
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
