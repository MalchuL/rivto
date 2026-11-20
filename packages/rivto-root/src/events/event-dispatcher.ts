import type { EventDelivery, EventEntry, EventRegistration, EventResult } from "./types";

/** Orders and dispatches typed, synchronous events without browser or editor dependencies. */
export class EventDispatcher<Events extends object> {
  private entries: ReadonlyMap<keyof Events, readonly EventEntry[]> = new Map();
  private readonly ids = new Set<string>();
  private readonly deliveries = new WeakMap<object, EventDelivery<Events>>();

  /**
   * Registers a handler that may claim events of one type.
   *
   * @param definition - Unique identity, typed event name and optional priority.
   * @param handler - Callback receiving the payload for the registered name.
   * @returns Idempotent disposer removing this exact registration.
   * @throws If identity is blank or duplicate, or priority is not finite.
   */
  register<Key extends keyof Events>(
    definition: EventRegistration<Key>,
    handler: (event: Events[Key]) => EventResult | void,
  ): () => void {
    return this.add(definition, handler, false);
  }

  /**
   * Registers a non-consuming observer for events of one type.
   *
   * Observers run before handlers for the same dispatch, even if a handler claims it.
   *
   * @param definition - Unique identity, typed event name and optional priority.
   * @param observer - Callback receiving the payload; its return value is ignored.
   * @returns Idempotent disposer removing this exact observation.
   * @throws If identity is blank or duplicate, or priority is not finite.
   */
  observe<Key extends keyof Events>(
    definition: EventRegistration<Key>,
    observer: (event: Events[Key]) => void,
  ): () => void {
    return this.add(definition, observer, true);
  }

  /**
   * Captures the current registrations for delivery across multiple event phases.
   *
   * Later additions are excluded; removals immediately disable captured entries.
   * A new event should use a new identity, including during reentrant dispatch.
   * Calls with the same identity share the original snapshot; without an identity
   * each call captures a fresh snapshot. Identities are retained weakly.
   *
   * @param identity - Optional identity shared by phases of the same event.
   * @returns Delivery over the current registration snapshot.
   */
  begin(identity?: object): EventDelivery<Events> {
    if (!identity) {
      return new EventSnapshot(this.entries);
    }
    let delivery = this.deliveries.get(identity);
    if (!delivery) {
      delivery = new EventSnapshot(this.entries);
      this.deliveries.set(identity, delivery);
    }
    return delivery;
  }

  /**
   * Delivers one event to active observers and handlers in descending priority order.
   *
   * Additions wait for a later dispatch; removals immediately skip pending callbacks.
   * Observer results cannot claim events. Handler errors propagate immediately.
   *
   * @param type - Name from this dispatcher's event map.
   * @param payload - Payload associated with that event name.
   * @returns `handled` when a handler claims the event, otherwise `continue`.
   * @throws Propagates observer and handler failures.
   */
  dispatch<Key extends keyof Events>(type: Key, payload: Events[Key]): EventResult {
    const delivery = this.begin();
    delivery.observe(type, payload);
    return delivery.dispatch(type, payload);
  }

  /**
   * Checks whether any active registration remains for an event type.
   *
   * @param type - Event name to inspect.
   * @returns Whether a handler or observer is currently registered for the name.
   */
  has<Key extends keyof Events>(type: Key): boolean {
    return this.entries.has(type);
  }

  /**
   * Retains a typed callback as an internal entry for its exact event name.
   *
   * @param definition - Identity, event name and optional priority.
   * @param callback - Handler or observer for that event's payload.
   * @param observer - Whether callback results are ignored during delivery.
   * @returns Idempotent disposer that frees the identity before returning.
   * @throws If identity is blank or already in use, or priority is not finite.
   */
  private add<Key extends keyof Events>(
    definition: EventRegistration<Key>,
    callback: (event: Events[Key]) => EventResult | void,
    observer: boolean,
  ): () => void {
    const id = definition.id;
    const priority = definition.priority ?? 0;
    if (!id.trim() || this.ids.has(id) || !Number.isFinite(priority)) {
      throw new Error("Event registration requires a unique ID and finite priority");
    }
    const entry: EventEntry = {
      priority,
      observer,
      active: true,
      /**
       * Restores the payload type associated with this exact event name.
       *
       * @param payload - Payload selected by the registered event name.
       * @returns Callback result, ignored when this entry is an observer.
       */
      invoke(payload) {
        return callback(payload as Events[Key]);
      },
    };
    this.ids.add(id);
    const entries = new Map(this.entries);
    entries.set(
      definition.type,
      [...(entries.get(definition.type) ?? []), entry].sort(
        (left, right) => right.priority - left.priority,
      ),
    );
    this.entries = entries;
    return () => {
      if (entry.active) {
        entry.active = false;
        this.ids.delete(id);
        const entries = new Map(this.entries);
        const remaining = (entries.get(definition.type) ?? []).filter((other) => other !== entry);
        if (remaining.length) {
          entries.set(definition.type, remaining);
        } else {
          entries.delete(definition.type);
        }
        this.entries = entries;
      }
    };
  }
}

/** Delivers one immutable registration-group snapshot while respecting active removals. */
class EventSnapshot<Events extends object> implements EventDelivery<Events> {
  /**
   * Captures the current registration groups without owning their entries.
   *
   * @param entries - Stable group map whose entries can be deactivated by their owners.
   */
  constructor(private readonly entries: ReadonlyMap<keyof Events, readonly EventEntry[]>) {}

  /**
   * Runs captured observers for the selected event name.
   *
   * @param type - Event name from the dispatcher's event map.
   * @param payload - Payload associated with that event name.
   * @returns Eligible active observers have run.
   * @throws Propagates observer failures.
   */
  observe<Key extends keyof Events>(type: Key, payload: Events[Key]): void {
    for (const entry of this.entries.get(type) ?? []) {
      if (entry.active && entry.observer) {
        entry.invoke(payload);
      }
    }
  }

  /**
   * Runs captured handlers until one claims the selected event.
   *
   * @param type - Event name from the dispatcher's event map.
   * @param payload - Payload associated with that event name.
   * @returns `handled` when a handler claims the event, otherwise `continue`.
   * @throws Propagates handler failures.
   */
  dispatch<Key extends keyof Events>(type: Key, payload: Events[Key]): EventResult {
    for (const entry of this.entries.get(type) ?? []) {
      if (entry.active && !entry.observer && entry.invoke(payload) === "handled") {
        return "handled";
      }
    }
    return "continue";
  }
}
