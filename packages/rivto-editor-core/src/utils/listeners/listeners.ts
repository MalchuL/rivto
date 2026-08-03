/** Listener callback selected from one event payload type. */
export type ListenerCallback<Value> = [Value] extends [void]
  ? () => void
  : (value: Value) => void;

/** Emit arguments selected from one event payload type. */
type ListenerArguments<Value> = [Value] extends [void]
  ? []
  : [value: Value];

/** Internal callback shape used to store differently typed named events. */
type StoredListener = (...args: never[]) => void;

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
   * Subscribes a callback to one named event.
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
    return () => eventListeners.delete(storedListener);
  }

  /**
   * Calls a stable snapshot of callbacks registered for one named event.
   *
   * Snapshot iteration permits listeners to unsubscribe themselves safely.
   * Events mapped to `void` require no payload; all others require exactly the
   * payload type declared in the event map.
   *
   * @typeParam Name - Selected event name from the owner's event map.
   * @param name - Event name whose callbacks should run.
   * @param args - Empty for `void` events, otherwise the event payload.
   * @returns No value.
   */
  emit<Name extends Extract<keyof Events, string>>(
    name: Name,
    ...args: ListenerArguments<Events[Name]>
  ): void {
    const eventListeners = this.listeners.get(name);
    if (!eventListeners) return;
    [...eventListeners].forEach((listener) => {
      const callback = listener as unknown as (...values: ListenerArguments<Events[Name]>) => void;
      callback(...args);
    });
  }

  /**
   * Removes listeners for one event, or every event when no name is supplied.
   *
   * @param name - Optional event name to clear independently.
   * @returns No value.
   */
  clear(name?: Extract<keyof Events, string>): void {
    if (name === undefined) {
      this.listeners.clear();
      return;
    }
    this.listeners.delete(name);
  }
}
