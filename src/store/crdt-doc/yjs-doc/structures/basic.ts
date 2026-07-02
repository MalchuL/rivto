import * as Y from 'yjs';
import { YjsError, YjsUndefinedError } from '../error';

export abstract class YjsBasic<T extends Y.AbstractType<any>> {
    /**
     * The YJS object.
     */
    private _yjsObj: T;

    /**
     * Creates a new YjsBasic.
     * @param yjsObj - The YJS object to wrap.
     */
    constructor(yjsObj: T) {
        if (yjsObj === undefined || yjsObj === null) {
            throw new YjsUndefinedError('YjsBasic: yjsObj is undefined or null');
        }
        this._yjsObj = yjsObj;
    }

    /**
     * Gets the YJS object.
     * @returns The YJS object.
     */
    protected get yjsObj(): T {
        return this._yjsObj;
    }

    /**
     * Gets the document.
     * @returns The document.
     */
    protected get doc(): Y.Doc | null {
        return this._yjsObj.doc;
    }

    /**
     * Gets the parent.
     * @returns The parent.
     */
    protected get parent(): Y.AbstractType<any> | null {
        let parent = this._yjsObj.parent;
        if (parent instanceof Y.Doc) {
            return null;
        }
        return parent;
    }

    /**
     * Checks if the YjsBasic is attached to a document.
     * @returns True if the YjsBasic is attached to a document, false otherwise.
     */
    protected get isAttached(): boolean {
        return this.doc !== null && this.doc !== undefined;
    }

    /**
     * Sets the YJS object.
     * @param yjsObj - The YJS object to set.
     */
    protected setYjsObj(yjsObj: T): void {
        this._yjsObj = yjsObj;
    }
}