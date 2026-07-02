import { BasicCRDTType, BasicType, CRDTArray, CRDTDoc, CRDTMap, CRDTText, CRDTTransaction, CRDTUndoManager, CRDTUndoScope, Unsubscribe, Provider, Instantiator, WrapBasicTypeToCRDTOptions } from "../types";
import * as utils from "./structures/utils";
import * as Y from 'yjs';
import { Storage } from "../../../utils";
import { YjsInstantiator } from "./utils/instantiator";

export class YjsDoc implements CRDTDoc {
    public readonly doc: Y.Doc;
    /**
     * The storage of the providers.
     */
    private providersStorage: Storage<Provider> = new Storage<Provider>();
    /**
     * The instantiator of the YjsDoc.
     */
    public readonly instantiator: Instantiator = new YjsInstantiator();

    /**
     * Creates a new YjsDoc.
     * @param id - The id of the YjsDoc.
     * @param doc - The Y.Doc to wrap.
     */
    constructor(private readonly _id: string, doc?: Y.Doc) {
        this.doc = doc || new Y.Doc();
    }

    /**
     * Attaches a provider to the YjsDoc.
     * @param provider - The provider to attach.
     * @returns A Promise that resolves when the provider is attached.
     */
    async attachProvider(provider: Provider): Promise<void> {
        this.providersStorage.setItem(provider.id, provider);
        await provider.connect(this);
    }

    /**
     * Detaches a provider from the YjsDoc.
     * @returns A Promise that resolves when the provider is detached.
     */
    async detachProvider(): Promise<void> {
        const provider = this.providersStorage.getOne();
        await provider.disconnect(this);
        this.providersStorage.removeItem(provider.id);
    }

    /**
     * Executes a transaction on the YjsDoc.
     * @param fn - The function to execute within the transaction.
     */
    transact(fn: (tx: CRDTTransaction) => void, origin?: unknown): void {
        this.doc.transact(fn, origin);
    }

    createUndoManager(scopes: CRDTUndoScope[], trackedOrigins: unknown[] = []): CRDTUndoManager {
        const nativeScopes = scopes.map((scope) => utils.unwrapCRDTtoYJS(scope) as Y.AbstractType<any>);
        const manager = new Y.UndoManager(nativeScopes, {
            trackedOrigins: new Set(trackedOrigins),
        });
        return {
            undo: () => manager.undo(),
            redo: () => manager.redo(),
            clear: () => manager.clear(),
            stopCapturing: () => manager.stopCapturing(),
            destroy: () => manager.destroy(),
        };
    }

    /**
     * Gets (and creates if not exists) an array from the YjsDoc.
     * @param path - The path to the array.
     * @returns The array.
     */
    getArray<Item extends BasicCRDTType = BasicCRDTType>(path: string): CRDTArray<Item> {
        return utils.wrapYJStoCRDT(this.doc.getArray(path)) as CRDTArray<Item>;
    }

    /**
     * Gets (and creates if not exists) a map from the YjsDoc.
     * @param path - The path to the map.
     * @returns The map.
     */
    getMap<Schema extends object = Record<string, BasicCRDTType>>(path: string): CRDTMap<Schema> {
        return utils.wrapYJStoCRDT(this.doc.getMap(path)) as CRDTMap<Schema>;
    }

    /**
     * Gets (and creates if not exists) a text from the YjsDoc.
     * @param path - The path to the text.
     * @returns The text.
     */
    getText(path: string): CRDTText {
        return utils.wrapYJStoCRDT(this.doc.getText(path)) as CRDTText;
    }

    /**
     * Subscribes to a document event.
     * @param event - The event to subscribe to.
     * @param handler - The function to execute when the event is triggered.
     * @returns A function to unsubscribe from the event.
     */
    on(event: "update" | "sync", handler: (event: any) => void): Unsubscribe {
        this.doc.on(event, handler);
        return () => { this.doc.off(event, handler); }
    }

    /**
     * Gets a snapshot of the YjsDoc.
     * @returns The snapshot.
     */
    getSnapshot(): any {
        return Y.encodeStateAsUpdate(this.doc);
    }
      
    /**
     * Applies a snapshot to the YjsDoc.
     * @param snapshot - The snapshot to apply.
     */
    applySnapshot(snapshot: any): void {
        Y.applyUpdate(this.doc, new Uint8Array(snapshot));
    }

    /**
     * Destroys the YjsDoc.
     */
    destroy(): void {
        this.doc.destroy();
    }

    /**
     * Converts the YjsDoc to a JSON representation.
     * @returns The BasicType.
     */
    toJSON(): BasicType {
        const snapshot: Record<string, BasicType> = {};

        this.doc.share.forEach((_, key) => {
            const value = this.doc.get(key)
            // If the value is an AbstractType (might be in synced docs), we need to convert it to a JSON object.
            if (value.constructor.name === 'AbstractType') {
               throw new Error(`YjsDoc.toJSON: AbstractType found in synced docs. To fix this call "doc.getMap(${key}) or doc.getText(${key}) or doc.getArray(${key})" to get the value.`);
            }
            // We call toJSON to convert the type to a JSON object. 
            // This is necessary because utils.convertYJSTypeToBasic can't convert object that wasn't get via getMap or other getters.
            // In such case it returns Y.AbstractType
            snapshot[key] = utils.convertYJSTypeToBasic(value)
        });
        return snapshot;
    }
    
    /**
     * Converts the YjsDoc from a JSON representation.
     * @param json - The JSON representation.
     * @param options - The options to convert the BasicType to a YJS type.
     */
    fromJSON(json: BasicType, options?: WrapBasicTypeToCRDTOptions): void {
        if (json === null || typeof json !== 'object') {
            throw new Error('Invalid JSON provided to YjsDoc.fromJSON');
        }
        if (Array.isArray(json)) {
            throw new Error('Invalid JSON provided to YjsDoc.fromJSON, expected an object');
        }
        const entries = json instanceof Map
            ? Array.from(json.entries())
            : Object.entries(json as Record<string, BasicType>);

        this.doc.transact(() => {
            // Clear existing share entries before restoring
            this.doc.share.forEach((_, key) => this.doc.share.delete(key));

            entries.forEach(([key, value]) => {
                if (value instanceof Map) {
                    const map = this.getMap(key);
                    value.forEach((v, k) => {
                        const basic = utils.basicToCRDT(v, options);
                        map.set(k, basic);
                    });
                } else if (Array.isArray(value)) {
                    const array = this.getArray(key);
                    value.forEach((v, i) => {
                        const basic = utils.basicToCRDT(v, options);
                        array.insert(i, basic);
                    });
                } else if (typeof value === 'string') {
                    const text = this.getText(key);
                    text.insert(0, value);
                } else if (typeof value === 'object') {
                    const map = this.getMap(key);
                    Object.entries(value as Record<string, BasicType>).forEach(([k, v]) => {
                        const basic = utils.basicToCRDT(v, options);
                        map.set(k, basic);
                    });
                } else {
                    throw new Error(`Unsupported root type for key "${key}" 
                        (got ${typeof value}, value: ${JSON.stringify(value)}, 
                        data: ${JSON.stringify(value)}) 
                        when restoring YjsDoc. Entries: ${JSON.stringify(entries)}`);
                }
            });
        });
    }

    /**
     * Gets the id of the YjsDoc.
     * @returns The id of the YjsDoc.
     */
    get id(): string {
        return this._id;
    }

}
