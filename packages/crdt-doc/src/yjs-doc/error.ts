import { CRDTError } from "../types/error";

export class YjsError extends CRDTError {
  /**
   * Creates a Yjs adapter error with the supplied diagnostic message.
   *
   * @param message - Diagnostic message for the error.
   */
  constructor(message: string) {
    super(message);
    this.name = "YjsError";
  }
}
export class YjsUndefinedError extends YjsError {}
export class YjsNotAttachedError extends YjsError {}
export class YjsInvalidJSONError extends YjsError {}
