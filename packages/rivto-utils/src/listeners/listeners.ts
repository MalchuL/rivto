import type { ListenerArguments, ListenerCallback, StoredListener } from "./types";

/**
 * Stores independently typed listener lists addressed by event name.
 *
 * Each owner creates one instance with an event map whose keys are event names
 * and whose values are listener input types. Use `void` for events without a
 * payload. Adding another event later only requires extending that event map.
 *
 * @typeParam Events - Mapping from string event names to listener input types.
 */
export class Listeners<Events extends object> {
  /** Listener sets isolated by their typed event names. */
  private readonly listeners = new Map<keyof Events, Set<StoredListener>>();

  /**
   * Counts event names that currently have subscribers.
   *
   * @returns The number of nonempty event channels.
   */
  get size(): number {
    return this.listeners.size;
  }

  /**
   * Lists event names that currently have subscribers.
   *
   * @returns A live iterator over the active event names.
   */
  keys(): IterableIterator<keyof Events> {
    return this.listeners.keys();
  }

  /**
   * Counts callbacks currently subscribed to all events.
   *
   * @returns The total number of registered callbacks.
   */
  get listenerCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }
    return count;
  }

  /**
   * Subscribes a callback to one named event.
   *
   * Registering the same callback twice for one name retains one set entry.
   *
   * @typeParam Name - Selected event name from the owner's event map.
   * @param name - Event name whose listener list receives the callback.
   * @param listener - Callback accepting the payload declared for that event.
   * @returns Idempotent function that removes this exact callback.
   */
  subscribe<Name extends Extract<keyof Events, string>>(
    name: Name,
    listener: ListenerCallback<Events[Name]>,
  ): () => void {
    let eventListeners = this.listeners.get(name);
    if (!eventListeners) {
      eventListeners = new Set();
      this.listeners.set(name, eventListeners);
    }
    const storedListener = listener as StoredListener;
    eventListeners.add(storedListener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      eventListeners.delete(storedListener);
      if (eventListeners.size === 0 && this.listeners.get(name) === eventListeners) {
        this.listeners.delete(name);
      }
    };
  }

  /**
   * Captures the current callbacks for specialized lifecycle cleanup.
   *
   * @param name - Event whose callbacks should be captured.
   * @returns A detached array in subscription order.
   */
  snapshot<Name extends Extract<keyof Events, string>>(
    name: Name,
  ): ListenerCallback<Events[Name]>[] {
    return [...(this.listeners.get(name) ?? [])] as ListenerCallback<Events[Name]>[];
  }

  /**
   * Calls a stable snapshot of callbacks registered for one named event.
   *
   * Additions and removals during delivery affect subsequent emissions only.
   * Snapshot iteration permits listeners to unsubscribe themselves safely.
   * Events mapped to `void` require no payload; all others require exactly the
   * payload type declared in the event map.
   *
   * @typeParam Name - Selected event name from the owner's event map.
   * @param name - Event name whose callbacks should run.
   * @param args - Empty for `void` events, otherwise the event payload.
   * @returns Current captured callbacks have been invoked.
   * @throws Propagates the first listener failure and stops delivery.
   */
  emit<Name extends Extract<keyof Events, string>>(
    name: Name,
    ...args: ListenerArguments<Events[Name]>
  ): void {
    const eventListeners = this.listeners.get(name);
    if (!eventListeners) {
      return;
    }
    [...eventListeners].forEach((listener) => {
      const callback = listener as unknown as (...values: ListenerArguments<Events[Name]>) => void;
      callback(...args);
    });
  }

  /**
   * Calls every listener in a snapshot and collects failures.
   *
   * @param name - Event whose listeners should run.
   * @param errorMessage - Message for the aggregate error when callbacks fail.
   * @param args - Empty for void events, otherwise the event payload.
   * @returns Every captured listener has been attempted.
   * @throws AggregateError containing callback failures in delivery order.
   */
  emitAndCollectErrors<Name extends Extract<keyof Events, string>>(
    name: Name,
    errorMessage: string,
    ...args: ListenerArguments<Events[Name]>
  ): void {
    const errors: unknown[] = [];
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      try {
        const callback = listener as unknown as (
          ...values: ListenerArguments<Events[Name]>
        ) => void;
        callback(...args);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, errorMessage);
    }
  }

  /**
   * Removes listeners for one event, or every event when no name is supplied.
   *
   * @param name - Optional event name to clear independently.
   * @returns The selected subscriptions are removed.
   */
  clear(name?: Extract<keyof Events, string>): void {
    if (name === undefined) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(name);
  }
}
