import { BasicCRDTType, BasicType, CRDTArray } from "../../types";
import * as Y from 'yjs';
import * as utils from './utils';
import { YjsBasic } from "./basic";
import { YjsNotAttachedError } from "../error";

const NOT_ATTACHED_ERROR = 'YjsArray is not attached to a document. Add this array to any object that is attached to a document like a YjsMap or a YjsArray';
const IS_FROM_JSON_ERROR = NOT_ATTACHED_ERROR + ' and this array was created from JSON. Add this array to any object that is attached to a document like a YjsMap or a YjsArray';
export class YjsArray<Item extends BasicCRDTType = BasicCRDTType>
    extends YjsBasic<Y.Array<any>> implements CRDTArray<Item> {
    // If the array was created from JSON, then it is not attached to a document.
    private isFromJson: boolean = false;

    /**
     * Creates a new YjsArray.
     * @param yArray - The Y.Array to wrap.
     */
    constructor(yArray?: Y.Array<any>) {
        const yArrayInstance = yArray || new Y.Array<any>();
        super(yArrayInstance);
    }

    /**
     * Gets the item at the given index.
     * @param index - The index of the item.
     * @returns The item at the given index.
     */
    get(index: number): Item | undefined {
        this.checkIfNotAttached();
        const item = this.yjsObj.get(index);
        return item === undefined ? undefined : utils.wrapYJStoCRDT(item) as Item;
    }

    /**
     * Inserts one or more items at the given index.
     * @param index - The index to insert the items at.
     * @param items - The items to insert.
     */
    insert(index: number, ...items: Item[]): void {
        const unwrapped = items.map(utils.unwrapCRDTtoYJS);
        this.yjsObj.insert(index, unwrapped);
    }

    /**
     * Appends one or more items to the end of the array.
     * @param items - The items to append.
     */
    push(...items: Item[]): void {
        const unwrapped = items.map(utils.unwrapCRDTtoYJS);
        this.yjsObj.push(unwrapped);
    }
  
    /**
     * Deletes one or more items at the given index.
     * @param index - The index to delete the items at.
     * @param count - The number of items to delete.
     */
    delete(index: number, count: number = 1): void {
        this.yjsObj.delete(index, count);
    }
    
    /**
     * Gets the length of the array.
     * @returns The length of the array.
     */
    get length(): number {
        this.checkIfNotAttached();
        return this.yjsObj.length;
    }
  
    /**
     * Executes a provided function once per array element.
     * @param callbackfn - The function to execute for each element.
     */
    forEach(callbackfn: (value: Item, index: number, array: CRDTArray<Item>) => void): void {
        this.checkIfNotAttached();
        this.yjsObj.forEach((item: BasicCRDTType, index: number) => {
            callbackfn(utils.wrapYJStoCRDT(item) as Item, index, this);
        });
    }

    /**
     * Converts the array to a BasicType[].
     * @returns The BasicType[].
     */
    toArray(): BasicType[] {
        this.checkIfNotAttached();
        // Y.Array.toJSON() returns an array of JSON representations.
        // But we need to adhere to BasicType definition which uses Map for objects.
        return utils.convertYJSTypeToBasic(this.yjsObj) as BasicType[];
    }

    /**
     * Converts the array to a JSON representation.
     * @returns The BasicType.
     */
    toJSON(): BasicType {
        this.checkIfNotAttached();
        return this.toArray();
    }

    /**
     * Checks if the array is not attached to a document.
     */
    private checkIfNotAttached(): void {
        if (!this.isAttached) {
            throw new YjsNotAttachedError(this.isFromJson ? IS_FROM_JSON_ERROR : NOT_ATTACHED_ERROR);
        }
        if (this.isAttached){
            // If the array is attached, then error is not thrown, so we can set the flag to false
            this.isFromJson = false;
        }
    }
}
