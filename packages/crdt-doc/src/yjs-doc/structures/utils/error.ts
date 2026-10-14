export class YjsUtilsError extends Error {
  /**
   * Creates an error for failures in the Yjs structure utilities.
   *
   * @param message - Diagnostic message for the error.
   */
  constructor(message: string) {
    super(message);
    this.name = "YjsUtilsError";
  }
}

export class YjsConvertError extends YjsUtilsError {
  /**
   * Creates an error for unsupported Yjs value conversion.
   *
   * @param message - Diagnostic message for the error.
   */
  constructor(message: string) {
    super(message);
    this.name = "YjsConvertError";
  }
}
