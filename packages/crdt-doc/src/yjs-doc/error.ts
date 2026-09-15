import { CRDTError } from "../types/error";

export class YjsError extends CRDTError {
    constructor(message: string) {
        super(message);
        this.name = "YjsError";
    }
}
export class YjsUndefinedError extends YjsError {}
export class YjsNotAttachedError extends YjsError {}
export class YjsInvalidJSONError extends YjsError {}