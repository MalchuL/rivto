import { BasicType, CRDTText, WrapBasicTypeToCRDTOptions } from "../../types";
import * as Y from 'yjs';
import * as utils from './utils';
import { YjsBasic } from "./basic";
import { YjsInvalidJSONError, YjsNotAttachedError } from "../error";

const NOT_ATTACHED_ERROR = 'YjsText is not attached to a document. Add this text to any object that is attached to a document like a YjsMap or a YjsArray';
const IS_FROM_JSON_ERROR = NOT_ATTACHED_ERROR + ' and this text was created from JSON. Add this text to any object that is attached to a document like a YjsMap or a YjsArray';

export class YjsText extends YjsBasic<Y.Text> implements CRDTText {
    // If the text was created from JSON, then it is not attached to a document.
    private isFromJson: boolean = false;

    /**
     * Creates a new YjsText.
     * @param yText - The Y.Text to wrap.
     */
    constructor(yText?: Y.Text) {
        const yTextInstance = yText || new Y.Text();
        super(yTextInstance);
    }

    /**
     * Inserts text at the given position.
     * @param pos - The position to insert the text at.
     * @param text - The text to insert.
     */
    insert(pos: number, text: string): void {
        this.yjsObj.insert(pos, text);
    }

    /**
     * Deletes text at the given position.
     * @param pos - The position to delete the text at.
     * @param length - The length of the text to delete.
     */
    delete(pos: number, length: number): void {
        this.yjsObj.delete(pos, length);
    }

    /**
     * Gets the length of the text.
     * @returns The length of the text.
     */
    get length(): number {
        this.checkIfNotAttached();
        return this.yjsObj.length;
    }

    /**
     * Converts the text to a string.
     * @returns The string.
     */
    toString(): string {
        this.checkIfNotAttached();
        return this.yjsObj.toString();
    }

    /**
     * Converts the text to a JSON representation.
     * @returns The BasicType.
     */
    toJSON(): BasicType {
        this.checkIfNotAttached();
        return this.yjsObj.toJSON();
    }
    
    /**
     * Checks if the text is not attached to a document.
     */
    private checkIfNotAttached(): void {
        if (!this.isAttached) {
            throw new YjsNotAttachedError(this.isFromJson ? IS_FROM_JSON_ERROR : NOT_ATTACHED_ERROR);
        }
    }
}