import { BlockCore, Link } from '../types';
import { CRDTDoc, CRDTTransaction, Unsubscribe } from '@/store/crdt-doc';
import { DocumentBundle } from './document-bundle';
import { ID } from './id';

export interface CRDTDocumentModelEvents {
    on(event: 'change' | 'blocks.update' | 'links.update', cb: (event: any) => void): Unsubscribe;
}


/**
 * Represents the high-level "brain" of a document, serving as an abstraction layer
 * between the complex CRDT (Yjs) logic and the application's consumer API.
 *
 * @class DocumentModel
 *
 * @description
 * The Host App and Editor Core interact exclusively with the DocumentModel, never directly
 * with the underlying CRDT layer. It acts as the Single Source of Truth for the
 * document's state.
 *
 * **Key Responsibilities:**
 * 1. **Source of Truth:** Maintains the current state of blocks and links. All edits pass through here.
 * 2. **CRDT Abstraction:** Encapsulates Yjs complexity (Y.Array, transactions) behind a semantic API.
 * 3. **Order Management:** Handles the linear sequence of blocks (via `order` or ID lists).
 * 4. **Event Emitter:** Notifies subscribers (e.g., the Renderer) of changes via events like `blocks.update`.
 * 5. **Serialization:** Manages hydration to/from JSON bundles for persistence.
 *
 * @example
 * // Instead of raw CRDT operations:
 * // yDoc.getArray('blocks').insert(...)
 *
 * // You use semantic methods:
 * await doc.insertBlock(myBlock);
 * const blocks = await doc.getBlocks();
 */
export interface CRDTDocumentModel extends CRDTDocumentModelEvents {
    id: string;
    crdt: CRDTDoc;

    // blocks
    getBlock(id: ID): Promise<BlockCore | undefined>;
    getBlocks(): Promise<BlockCore[]>;
    insertBlock(block: BlockCore, afterId?: ID | null): Promise<void>;
    removeBlock(id: ID): Promise<void>;
    moveBlock(id: ID, afterId: ID | null): Promise<void>;
    updateBlock(id: ID, patch: Partial<BlockCore>): Promise<void>;

    // links
    getLinks(): Promise<Link[]>;
    createLink(link: Link): Promise<void>;
    removeLink(id: ID): Promise<void>;

    // snapshot/serialization
    toBundle(): Promise<DocumentBundle>;
    loadFromBundle(bundle: DocumentBundle): Promise<void>;

    // low-level access
    transact(fn: (tx: CRDTTransaction) => void): void;
}