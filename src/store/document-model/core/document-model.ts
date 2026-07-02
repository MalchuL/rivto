import { CRDTArray, CRDTMap, CRDTDoc, CRDTTransaction, Unsubscribe, Instantiator } from "@/store/crdt-doc";
import { ID, BlockCore, Link } from "../types";
import { DocumentBundle } from "../types/document-bundle";
import { CRDTDocumentModel } from "../types/document-model";
import { BlockCoreProxy } from "./block-core";
import { OrderingStrategy } from "./utils/reordering";
import { LinkProxy } from "./link";
import { DocumentBundleImpl } from "./document-bundle";

function assignPlainObjectToCRDTMap(model: CRDTMap, instantiator: Instantiator, value: any, options?: any): void {
    model.clear();
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Expected object when hydrating CRDTMap from bundle");
    }
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
        model.set(k, instantiator.plainObjectToCRDT(v, options));
    }
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
 * !!Important any methods for get and set 
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
export class DocumentModelImpl implements CRDTDocumentModel {
    id: string;
    crdt: CRDTDoc;
    private orderingStrategy = new OrderingStrategy();


    constructor(id: string, crdt: CRDTDoc) {
        this.id = id;
        this.crdt = crdt;
    }

    protected get blocks(): CRDTMap {
        return this.crdt.getMap('blocks');
    }

    protected get links(): CRDTMap {
        return this.crdt.getMap('links');
    }

    public get instantiator(): Instantiator {
        return this.crdt.instantiator;
    }

    async getBlock(id: ID): Promise<BlockCore | undefined> {
        const model = this.blocks.get(id);
        if (!model) {
            return undefined;
        }
        return BlockCoreProxy.getProxy({ model: model as CRDTMap, instantiator: this.instantiator });
    }
    async getBlocks(): Promise<BlockCore[]> {
        return Array.from(this.blocks.values()).map((value) => BlockCoreProxy.getProxy({ model: value as CRDTMap, instantiator: this.instantiator }));
    }
    /**
     * 
     * @param block - The block to insert.
     * @param afterId - The id of the block to insert after. If null, the block will be inserted at the beginning. If undefined, the block will be appended to the end.
     * @returns A promise that resolves when the block is inserted.
     */
    async insertBlock(block: BlockCore, afterId?: ID | null): Promise<void> {
        const blockModel = this.instantiator.createMap();
        const blockImpl = BlockCoreProxy.createAssign({model: blockModel, instantiator: this.instantiator}, block);
        const blocks = await this.getBlocks();
        this.orderingStrategy.insert(blocks, blockImpl, afterId);
        this.blocks.set(block.id, blockModel);
    }
    /**
     * Removes a block from the document.
     * @param id - The id of the block to remove.
     * @returns A promise that resolves when the block is removed.
     */
    async removeBlock(id: ID): Promise<void> {
        const blocks = await this.getBlocks();
        this.orderingStrategy.remove(blocks, id);
        this.blocks.delete(id);
    }
    /**
     * Moves a block to a new position in the document.
     * @param id - The id of the block to move.
     * @param afterId - The id of the block to move after. If null, the block will be moved to the start of the document.
     * @returns A promise that resolves when the block is moved.
     */
    async moveBlock(id: ID, afterId: ID | null): Promise<void> {
        const blocks = await this.getBlocks();
        this.orderingStrategy.move(blocks, id, afterId);
    }
    /**
     * Updates a block in the document.
     * @param id - The id of the block to update.
     * @param patch - The patch to apply to the block.
     * @returns A promise that resolves when the block is updated.
     */
    async updateBlock(id: ID, patch: Partial<BlockCore>): Promise<void> {
        const block = await this.getBlock(id);
        if (!block) {
            throw new Error(`Block with id ${id} not found`);
        }

        const blockImpl = block as BlockCoreProxy;
        const merged: BlockCore = {
            id: blockImpl.id,
            type: blockImpl.type,
            order: blockImpl.order,
            position: blockImpl.position,
            size: blockImpl.size,
            zIndex: blockImpl.zIndex,
            connectedWith: blockImpl.connectedWith,
            pluginStates: blockImpl.pluginStates,
            meta: blockImpl.meta,
            ...patch,
        };

        blockImpl.setParams(merged);
    }
    async getLinks(): Promise<Link[]> {
        return Array.from(this.links.values()).map((value) => LinkProxy.getProxy({ model: value as CRDTMap, instantiator: this.instantiator }));
    }
    async createLink(link: Link): Promise<void> {
        const linkModel = this.instantiator.createMap();
        LinkProxy.createAssign({ model: linkModel, instantiator: this.instantiator }, link);
        this.links.set(link.id, linkModel);
    }
    async removeLink(id: ID): Promise<void> {
        this.links.delete(id);
    }

    async toBundle(): Promise<DocumentBundle> {
        const blocks = await this.getBlocks();
        const links = await this.getLinks();

        const serializedBlocks = blocks.map((b) => {
            const position = b.position ? { x: b.position.x, y: b.position.y } : undefined;
            const size = b.size ? { width: b.size.width, height: b.size.height } : undefined;

            const metaModel = (b as any)?.model?.get?.("meta");
            const meta = metaModel !== undefined ? (metaModel as CRDTMap).toObject?.() : undefined;

            // PluginStates is stored as a CRDTMap under the hood; only include if present & non-empty.
            const pluginStatesModel = (b as any)?.model?.get?.("pluginStates");
            let pluginStatesJson: any = undefined;
            if (pluginStatesModel !== undefined) {
                const obj = (pluginStatesModel as CRDTMap).toObject?.();
                if (obj && typeof obj === "object" && Object.keys(obj as any).length > 0) {
                    pluginStatesJson = obj;
                }
            }

            return {
                id: b.id,
                type: b.type,
                order: b.order ?? 0,
                position,
                size,
                zIndex: b.zIndex ?? 0,
                connectedWith: b.connectedWith ?? null,
                pluginStates: pluginStatesJson,
                meta,
            };
        });

        const serializedLinks = links.map((l) => {
            const metaModel = (l as any)?.model?.get?.("meta");
            const meta = metaModel !== undefined ? (metaModel as CRDTMap).toObject?.() : undefined;
            return {
                id: l.id,
                from: { blockId: l.from.blockId, port: l.from.port ?? null },
                to: { blockId: l.to.blockId, port: l.to.port ?? null },
                meta,
            };
        });

        return new DocumentBundleImpl({
            version: 1,
            meta: {},
            plugins: {},
            blocks: serializedBlocks as any,
            links: serializedLinks as any,
        });
    }

    async loadFromBundle(bundle: DocumentBundle): Promise<void> {
        // Rebuild CRDT state from the bundle. Bundle is expected to be pure JSON
        // (no Yjs types, no CRDT wrappers).
        this.transact(() => {
            this.blocks.clear();
            this.links.clear();

            const blocks = (bundle.blocks ?? []) as any[];
            blocks.forEach((b, index) => {
                if (!b?.id || !b?.type) {
                    throw new Error("Invalid block in bundle (missing id/type)");
                }

                const blockModel = this.instantiator.createMap();

                blockModel.set("id", b.id);
                blockModel.set("type", b.type);
                blockModel.set("order", typeof b.order === "number" ? b.order : index);
                blockModel.set("zIndex", typeof b.zIndex === "number" ? b.zIndex : 0);
                blockModel.set("connectedWith", b.connectedWith ?? null);

                if (b.position !== undefined) {
                    const positionModel = this.instantiator.createMap();
                    assignPlainObjectToCRDTMap(positionModel, this.instantiator, b.position, { string2crdttext: false });
                    blockModel.set("position", positionModel);
                }

                if (b.size !== undefined) {
                    const sizeModel = this.instantiator.createMap();
                    assignPlainObjectToCRDTMap(sizeModel, this.instantiator, b.size, { string2crdttext: false });
                    blockModel.set("size", sizeModel);
                }

                if (b.pluginStates !== undefined) {
                    const pluginStatesModel = this.instantiator.createMap();
                    assignPlainObjectToCRDTMap(pluginStatesModel, this.instantiator, b.pluginStates, { string2crdttext: false });
                    blockModel.set("pluginStates", pluginStatesModel);
                }

                if (b.meta !== undefined) {
                    const metaModel = this.instantiator.createMap();
                    assignPlainObjectToCRDTMap(metaModel, this.instantiator, b.meta, { string2crdttext: false });
                    blockModel.set("meta", metaModel);
                }

                this.blocks.set(b.id, blockModel);
            });

            const links = (bundle.links ?? []) as any[];
            links.forEach((l) => {
                if (!l?.id || !l?.from?.blockId || !l?.to?.blockId) {
                    throw new Error("Invalid link in bundle (missing id/from/to)");
                }

                const linkModel = this.instantiator.createMap();
                linkModel.set("id", l.id);

                const fromModel = this.instantiator.createMap();
                fromModel.set("blockId", l.from.blockId);
                fromModel.set("port", l.from.port ?? null);
                linkModel.set("from", fromModel);

                const toModel = this.instantiator.createMap();
                toModel.set("blockId", l.to.blockId);
                toModel.set("port", l.to.port ?? null);
                linkModel.set("to", toModel);

                if (l.meta !== undefined) {
                    const metaModel = this.instantiator.createMap();
                    assignPlainObjectToCRDTMap(metaModel, this.instantiator, l.meta, { string2crdttext: false });
                    linkModel.set("meta", metaModel);
                }

                this.links.set(l.id, linkModel);
            });
        });
    }
    transact(fn: (tx: CRDTTransaction) => void): void {
        this.crdt.transact(fn);
    }
    on(event: "change" | "blocks.update" | "links.update", cb: (event: any) => void): Unsubscribe {
        // "change" is the low-level CRDT "update" event.
        if (event === "change") {
            return this.crdt.on("update", cb);
        }

        // For "blocks.update"/"links.update", we need deep observation on the
        // corresponding root map. Y.Doc "update" events don't include a "path".
        const ydoc = (this.crdt as any)?.doc;
        const getMap = ydoc?.getMap?.bind(ydoc);
        if (!getMap) {
            // Fallback: best-effort subscribe to any document updates.
            return this.crdt.on("update", cb);
        }

        const rootKey = event === "blocks.update" ? "blocks" : "links";
        const ymap = getMap(rootKey);
        const handler = (events: any, transaction: any) => {
            cb({ path: rootKey, events, transaction });
        };

        // Prefer observeDeep when available (captures nested map changes too).
        if (typeof ymap?.observeDeep === "function" && typeof ymap?.unobserveDeep === "function") {
            ymap.observeDeep(handler);
            return () => ymap.unobserveDeep(handler);
        }
        if (typeof ymap?.observe === "function" && typeof ymap?.unobserve === "function") {
            ymap.observe(handler);
            return () => ymap.unobserve(handler);
        }

        return this.crdt.on("update", cb);
    }
}