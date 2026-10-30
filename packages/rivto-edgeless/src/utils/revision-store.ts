import { Listeners } from "@chulane/rivto-utils";

/** Small observable revision used by presentation registries. */
export class RevisionStore {
  private readonly listeners = new Listeners<{ changed: void }>();
  private value = 0;

  /**
   * Reads the store's current monotonic revision.
   *
   * @returns Current revision number.
   */
  get revision(): number {
    return this.value;
  }

  /**
   * Subscribes to revision changes.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("changed", listener);
  }

  /**
   * Increments the revision and synchronously notifies a snapshot of listeners.
   *
   * @returns Current subscribers have received the new revision.
   */
  changed(): void {
    this.value += 1;
    this.listeners.emit("changed");
  }

  /**
   * Removes all revision listeners without resetting the revision.
   *
   * @returns The store retains its value without subscriber references.
   */
  clear(): void {
    this.listeners.clear();
  }
}
