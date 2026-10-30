/** Read-only synchronous snapshot contract suitable for useSyncExternalStore. */
export interface CanvasSnapshot<T> {
  /**
   * Reads the current immutable snapshot.
   *
   * @returns The same reference until the observed value changes.
   */
  get(): T;
  /**
   * Observes snapshot replacements synchronously.
   *
   * @param listener - Callback invoked after the value changes.
   * @returns Cleanup removing this observer.
   */
  subscribe(listener: () => void): () => void;
}

/** Small synchronous store with stable snapshots for React external subscriptions. */
export class Store<T> {
  private readonly listeners = new Set<() => void>();
  /**
   * Creates a store without installing external subscriptions.
   *
   * @param value - Initial immutable snapshot.
   */
  constructor(private value: T) {}
  /**
   * Reads the current snapshot without allocating.
   *
   * @returns The same reference until set receives a different value.
   */
  get = (): T => {
    return this.value;
  };
  /**
   * Observes changes synchronously.
   *
   * @param listener - Callback invoked after replacement.
   * @returns Cleanup removing this callback.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /**
   * Replaces the snapshot and notifies subscribers when its identity changes.
   *
   * @param value - Next immutable snapshot.
   * @returns All current subscribers have been notified.
   */
  set(value: T): void {
    if (Object.is(value, this.value)) {
      return;
    }
    this.value = value;
    for (const listener of this.listeners) {
      listener();
    }
  }
  /**
   * Releases all observers while retaining the last snapshot.
   *
   * @returns The store no longer has subscribers.
   */
  clear(): void {
    this.listeners.clear();
  }
}
