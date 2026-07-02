import { Serializible } from "./crdt";
import { CRDTArray } from "./array";
import { CRDTMap } from "./map";
import { CRDTText } from "./text";
import { CRDTTransaction } from "./transaction";
import { Instantiator } from "./utils";
import { CRDTUndoManager, CRDTUndoScope } from "./undo";
import { BasicCRDTType } from "./basic-types";


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
    get instantiator(): Instantiator;

    /**
     * Attach a real-time provider (e.g. WebSocket) for syncing updates.
     */
    attachProvider(provider: any): Promise<void>;

    /**
     * Detach the currently attached provider.
     */
    detachProvider(): Promise<void>;

    /**
     * Execute operations within a transaction for atomicity.
     */
    transact(fn: (tx: CRDTTransaction) => void, origin?: unknown): void;

    /** Create history for the provided CRDT scopes without leaking adapter types. */
    createUndoManager(scopes: CRDTUndoScope[], trackedOrigins?: unknown[]): CRDTUndoManager;

    /**
     * Get a typed CRDT-backed array at the given document path.
     */
    getArray<Item extends BasicCRDTType = BasicCRDTType>(path: string): CRDTArray<Item>;

    /**
     * Get a schema-typed CRDT-backed map at the given document path.
     */
    getMap<Schema extends object = Record<string, BasicCRDTType>>(path: string): CRDTMap<Schema>;

    /**
     * Get a CRDT-backed collaborative text at the given document path.
     */
    getText(path: string): CRDTText;

    /**
     * Subscribe to document events: 'update' (local/remote update),
     * 'sync' (synchronization status), or 'snapshot' (doc state).
     */
    on(event: 'update' | 'sync' | 'snapshot', handler: (event: any) => void): Unsubscribe;

    /**
     * Get a serializable snapshot of the document state.
     */
    getSnapshot(): any;

    /**
     * Apply a snapshot to restore document state.
     */
    applySnapshot(snapshot: any): void;

    /**
     * Destroys all internal state and unregisters handlers.
     */
    destroy(): void;
}
