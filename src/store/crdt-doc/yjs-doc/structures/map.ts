import { BasicCRDTType, BasicType, CRDTMap, WrapBasicTypeToCRDTOptions } from "../../types";
import * as Y from 'yjs';
import * as utils from './utils';
import { YjsBasic } from "./basic";
import { YjsInvalidJSONError, YjsNotAttachedError } from "../error";


const NOT_ATTACHED_ERROR = 'YjsMap is not attached to a document. Add this map to any object that is attached to a document like a YjsMap or a YjsArray';
const IS_FROM_JSON_ERROR = NOT_ATTACHED_ERROR + ' and this map was created from JSON. Add this map to any object that is attached to a document like a YjsMap or a YjsArray';

export class YjsMap extends YjsBasic<Y.Map<any>> implements CRDTMap{
    
    // If the map was created from JSON, then it is not attached to a document.
    private isFromJson: boolean = false;

    /**
     * Creates a new YjsMap.
     * @param yMap - The Y.Map to wrap.
     */
    constructor(yMap?: Y.Map<any>) {
      const yMapInstance = yMap || new Y.Map<any>();
      super(yMapInstance);
    }

    /**
     * Gets the value for a given key.
     * @param key - The key to get the value for.
     * @returns The value for the given key.
     */
    get(key: string): BasicCRDTType | undefined {
        this.checkIfNotAttached();
        const val = this.yjsObj.get(key);
        return val === undefined ? undefined : utils.wrapYJStoCRDT(val);
    }

    /**
     * Sets the value for a given key.
     * @param key - The key to set the value for.
     * @param val - The value to set.
     * @returns The map.
     */
    set(key: string, val: BasicCRDTType): this {
        this.yjsObj.set(key, utils.unwrapCRDTtoYJS(val));
        return this;
    }

    /**
     * Gets the length of the map.
     * @returns The length of the map.
     */
    get length(): number {
        this.checkIfNotAttached();
        return this.yjsObj.size;
    }

    /**
     * Gets the size of the map.
     * @returns The size of the map.
     */
    get size(): number {
        return this.length;
    }

    /**
     * Gets the keys of the map.
     * @returns The keys of the map.
     */
    keys(): MapIterator<string> {
        this.checkIfNotAttached();
        return this.yjsObj.keys() as MapIterator<string>;
    }

    /**
     * Gets the values of the map.
     * @returns The values of the map.
     */
    values(): MapIterator<BasicCRDTType> {
        this.checkIfNotAttached();
        return (Array.from(this.yjsObj.values()).map(utils.wrapYJStoCRDT))[Symbol.iterator]() as  MapIterator<BasicCRDTType>;
    }

    /**
     * Gets the entries of the map.
     * @returns The entries of the map.
     */
    entries(): MapIterator<[string, BasicCRDTType]> {
        this.checkIfNotAttached();
        return (Array.from(this.yjsObj.entries()).map(([k, v]) => [k, utils.wrapYJStoCRDT(v)]))[Symbol.iterator]() as MapIterator<[string, BasicCRDTType]>;
    }

    /**
     * Checks if the map has a given key.
     * @param key - The key to check.
     * @returns True if the map has the given key, false otherwise.
     */
    has(key: string): boolean {
        this.checkIfNotAttached();
        return this.yjsObj.has(key);
    }

    /**
     * Deletes a given key from the map.
     * @param key - The key to delete.
     */
    delete(key: string): void {
        this.yjsObj.delete(key);
    }

    /**
     * Clears the map.
     */
    clear(): void {
        this.yjsObj.clear();
    }

    /**
     * Executes a provided function once per map element.
     * @param callbackfn - The function to execute for each element.
     */
    forEach(callbackfn: (value: BasicCRDTType, key: string, map: CRDTMap) => void): void {
        this.checkIfNotAttached();
        this.yjsObj.forEach((val: BasicCRDTType, key: string) => {
            callbackfn(utils.wrapYJStoCRDT(val), key, this);
        });
    }

    /**
     * Converts the map to a Record<string, BasicType>.
     * @returns The Record<string, BasicType>.
     */
    toObject(): Record<string, BasicType> {
        this.checkIfNotAttached();
        return utils.convertYJSTypeToBasic(this.yjsObj, { crdtmap2map: false }) as Record<string, BasicType>;
    }

    /**
     * Converts the map to a Map<string, BasicType>.
     * @returns The Map<string, BasicType>.
     */
    toMap(): Map<string, BasicType> {
        this.checkIfNotAttached();
        return utils.convertYJSTypeToBasic(this.yjsObj, { crdtmap2map: true }) as Map<string, BasicType>;
    }

    /**
     * Converts the map to a JSON representation.
     * @returns The BasicType.
     */
    toJSON(): BasicType {
        this.checkIfNotAttached();
        return this.toObject();
    }

    /**
     * Checks if the map is not attached to a document.
     */
    private checkIfNotAttached(): void {
        if (!this.isAttached) {
            throw new YjsNotAttachedError(this.isFromJson ? IS_FROM_JSON_ERROR : NOT_ATTACHED_ERROR);
        }
        if (this.isAttached){
            // If the map is attached, then error is not thrown, so we can set the flag to false
            this.isFromJson = false;
        }
    }
}