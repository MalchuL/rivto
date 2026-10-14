export class CRDTError extends Error {
  /**
   * Creates an adapter-neutral CRDT error with the supplied diagnostic message.
   *
   * @param message - Diagnostic message for the error.
   */
  constructor(message: string) {
    super(message);
    this.name = "CRDTError";
  }
}
