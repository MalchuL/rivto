/** Remembers the last opaque transaction without keeping its object alive. */
export class TransactionIdentity {
  private reference?: WeakRef<object>;
  private primitive: unknown;

  /**
   * Compares a transaction with the last remembered identity.
   *
   * @param transaction - Opaque identity supplied by the CRDT adapter.
   * @returns True when the same live object or primitive was remembered.
   */
  matches(transaction: unknown): boolean {
    if (this.reference) {
      return transaction !== undefined && this.reference.deref() === transaction;
    }
    return this.primitive === transaction;
  }

  /**
   * Remembers an identity for later comparisons without retaining objects.
   *
   * The adapter or caller retains the transaction while it can still be observed.
   *
   * @param transaction - Opaque identity supplied by the CRDT adapter.
   * @returns The remembered identity is replaced.
   */
  remember(transaction: unknown): void {
    if (
      (typeof transaction === "object" && transaction !== null) ||
      typeof transaction === "function"
    ) {
      this.reference = new WeakRef(transaction);
      this.primitive = undefined;
    } else {
      this.reference = undefined;
      this.primitive = transaction;
    }
  }
}
