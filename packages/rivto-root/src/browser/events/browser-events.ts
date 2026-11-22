import { EventDispatcher } from "../../events/event-dispatcher";
import type {
  BrowserEventGroup,
  BrowserEventObservation,
  BrowserEventPayloads,
  BrowserEventRegistration,
  BrowserInputMap,
  CustomEventDefinition,
  CustomEventRegistration,
  EventResult,
  BrowserListenerRoot,
} from "../../events/types";
import { BrowserInputListeners } from "../input/browser-input-listeners";
import { getBrowserInputRootElement } from "../input/browser-input-root-elements";

/** Owns typed browser and custom registrations separately from the mounted DOM lifetime. */
export class BrowserEvents<CustomEvents extends object = object> {
  private static readonly attachedRoots = new WeakMap<HTMLElement, BrowserListenerRoot>();
  private readonly groups = new Map<string, BrowserEventGroup>();
  private readonly dispatcher = new EventDispatcher<BrowserEventPayloads>();
  private readonly listeners = new BrowserInputListeners({ trackDispatch: true });
  private root?: BrowserListenerRoot;

  /**
   * Registers input before or after occurrence attachment without changing document state.
   *
   * Registrations survive detach; their owners must call the returned disposer.
   * Root handlers exclude nested attached occurrence roots; global handlers must admit
   * only their own active gestures. Passive and non-passive registrations use
   * separate listener groups; equal priorities retain registration order within
   * each group, and a claim stops only that group's handlers.
   * After this runtime starts delivering a native dispatch, additions wait for
   * the next dispatch across its listener groups; removals prevent later delivery.
   *
   * @param registration - Unique identity, native placement and typed callback.
   * @returns Idempotent disposer removing only this registration and unused listeners.
   * @throws If the ID is blank or duplicated, priority is not finite, or listener setup fails.
   */
  register<K extends keyof BrowserInputMap>(registration: BrowserEventRegistration<K>): () => void;
  /**
   * Registers a typed custom event handler owned by this occurrence.
   *
   * @param registration - Custom event identity, priority and handler.
   * @returns Idempotent disposer removing this exact registration.
   * @throws If the ID is invalid or duplicate, or priority is not finite.
   */
  register<K extends Extract<keyof CustomEvents, string>>(
    registration: CustomEventRegistration<CustomEvents, K>,
  ): () => void;
  /**
   * Routes a browser or custom registration to its respective delivery group.
   *
   * @param registration - Typed browser input or explicitly marked custom event.
   * @returns Idempotent disposer removing the registration.
   * @throws If registration validation or browser listener installation fails.
   */
  register(
    registration:
      | BrowserEventRegistration<keyof BrowserInputMap>
      | CustomEventRegistration<CustomEvents, Extract<keyof CustomEvents, string>>,
  ): () => void {
    if ("kind" in registration) {
      return this.addCustom(registration, false);
    }
    return this.add(registration, false);
  }

  /**
   * Observes a browser input without claiming its listener group's delivery.
   *
   * Observers run before handlers in the same group even if a handler claims the
   * input. Registration and removal follow the same remount and snapshot rules as handlers.
   * An observation including nested occurrences uses a separate browser listener;
   * passive mode also separates groups. Browser listener order applies between groups.
   *
   * @param definition - Unique identity, native placement and priority.
   * @param observer - Callback receiving normalized input for this event name.
   * @returns Idempotent disposer removing this observer and any unused listener.
   * @throws If the ID is blank or duplicated, priority is not finite, or setup fails.
   */
  observe<K extends keyof BrowserInputMap>(
    definition: BrowserEventObservation<K>,
    observer: (event: BrowserInputMap[K]) => void,
  ): () => void;
  /**
   * Observes a custom event before its handlers without claiming it.
   *
   * @param definition - Custom event identity and priority.
   * @param observer - Callback receiving the producer's typed payload.
   * @returns Idempotent disposer removing this exact observation.
   * @throws If the ID is invalid or duplicate, or priority is not finite.
   */
  observe<K extends Extract<keyof CustomEvents, string>>(
    definition: CustomEventDefinition<K>,
    observer: (event: CustomEvents[K]) => void,
  ): () => void;
  /**
   * Routes a browser or custom observer to its respective delivery group.
   *
   * @param definition - Typed browser input or explicitly marked custom event.
   * @param observer - Callback selected by the matching overload.
   * @returns Idempotent disposer removing the observer.
   * @throws If registration validation or browser listener installation fails.
   */
  observe(
    definition:
      | BrowserEventObservation<keyof BrowserInputMap>
      | CustomEventDefinition<Extract<keyof CustomEvents, string>>,
    observer: (event: never) => void,
  ): () => void {
    if ("kind" in definition) {
      // The overload pairs this callback with the definition's custom event name.
      const handle = observer as (event: CustomEvents[Extract<keyof CustomEvents, string>]) => void;
      return this.addCustom({ ...definition, handle }, true);
    }
    // The overload pairs this callback with the definition's browser input name.
    const handle = observer as (event: BrowserInputMap[keyof BrowserInputMap]) => void;
    return this.add({ ...definition, handle }, true, definition.includeNested ?? false);
  }

  /**
   * Delivers a custom event to this occurrence's observers and handlers.
   *
   * The producer owns the payload. Delivery is synchronous and independent of
   * browser attachment; callbacks receive the same value supplied by the producer.
   * Borrowers that only register or observe should receive a narrow interface
   * that excludes this publishing operation and attachment methods.
   *
   * @param type - Custom event name from this occurrence's event map.
   * @param payload - Value associated with that name.
   * @returns Handled when a handler claims delivery, otherwise continue.
   * @throws Propagates observer or handler failures.
   */
  publish<K extends Extract<keyof CustomEvents, string>>(
    type: K,
    payload: CustomEvents[K],
  ): EventResult {
    return this.dispatcher.dispatch(JSON.stringify(["custom", type]), payload);
  }

  /**
   * Attaches all registered inputs to one root and its document/window.
   *
   * The caller owns the Root; detaching this event manager does not detach it.
   *
   * @param root - Browser-backed occurrence receiving input and defining the global event realm.
   * @returns Idempotent detach retaining registrations for a later attachment.
   * @throws If this runtime or root already has an event owner, the document has
   * no window, or native setup fails.
   * A failure during setup rollback is retained alongside the setup error.
   */
  attach(root: BrowserListenerRoot): () => void {
    const element = getBrowserInputRootElement(root);
    if (
      this.root ||
      !element ||
      !root.isAttached() ||
      BrowserEvents.hasActiveRoot(element) ||
      !element.ownerDocument.defaultView
    ) {
      throw new Error("Browser events require an unattached root with a window");
    }
    if (!root.isAttached() || BrowserEvents.hasActiveRoot(element) || this.root) {
      throw new Error("Browser events require an unattached root with a window");
    }
    this.root = root;
    BrowserEvents.attachedRoots.set(element, root);
    let detachListeners: () => void;
    try {
      detachListeners = this.listeners.attach(root);
    } catch (error) {
      this.root = undefined;
      if (BrowserEvents.attachedRoots.get(element) === root) {
        BrowserEvents.attachedRoots.delete(element);
      }
      throw error;
    }
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.root = undefined;
        if (BrowserEvents.attachedRoots.get(element) === root) {
          BrowserEvents.attachedRoots.delete(element);
        }
        detachListeners();
      }
    };
  }

  /**
   * Checks whether the element still has a live event owner.
   *
   * @param element - Browser mount whose event ownership is being checked.
   * @returns True when its current owner remains attached.
   * @throws Propagates ownership-check failures.
   */
  private static hasActiveRoot(element: HTMLElement): boolean {
    let owner = BrowserEvents.attachedRoots.get(element);
    while (owner) {
      const active = owner.isAttached();
      const current = BrowserEvents.attachedRoots.get(element);
      if (current === owner) {
        return active;
      }
      owner = current;
    }
    return false;
  }

  /**
   * Adds a handler or observer to one retained native listener group.
   *
   * @param registration - Identity, listener options and typed callback.
   * @param observer - Whether the callback observes input without claiming it.
   * @param includeNested - Whether this observation receives nested occurrence input.
   * @returns Idempotent disposer releasing the registration and an empty group.
   * @throws If the registration is invalid or listener setup fails.
   */
  private add<K extends keyof BrowserInputMap>(
    registration: BrowserEventRegistration<K>,
    observer: boolean,
    includeNested = false,
  ): () => void {
    const {
      id,
      type,
      target = "root",
      capture = false,
      passive = false,
      priority = 0,
      handle,
    } = registration;
    const key = JSON.stringify([type, target, capture, passive, includeNested]);
    const group = this.groups.get(key) ?? { type, target, capture, passive, includeNested };
    // The group is keyed by this exact event-map name; type erasure stays internal.
    const invoke = (event: BrowserEventPayloads[string]) => handle(event as BrowserInputMap[K]);
    const entry = { id, type: key, priority };
    const releaseEntry = observer
      ? this.dispatcher.observe(entry, invoke)
      : this.dispatcher.register(entry, invoke);
    this.groups.set(key, group);
    try {
      this.connect(group);
    } catch (error) {
      releaseEntry();
      if (!this.dispatcher.has(key)) {
        this.groups.delete(key);
      }
      throw error;
    }
    return () => {
      releaseEntry();
      if (!this.dispatcher.has(key) && this.groups.get(key) === group) {
        const release = group.release;
        group.release = undefined;
        this.groups.delete(key);
        release?.();
      }
    };
  }

  /**
   * Retains one custom callback in the shared registration and ordering store.
   *
   * @param registration - Typed custom event registration.
   * @param observer - Whether the callback observes without claiming delivery.
   * @returns Idempotent disposer releasing the callback and its identity.
   * @throws If identity or priority is invalid.
   */
  private addCustom<K extends Extract<keyof CustomEvents, string>>(
    registration: CustomEventRegistration<CustomEvents, K>,
    observer: boolean,
  ): () => void {
    const { id, type, priority, handle } = registration;
    const definition = { id, type: JSON.stringify(["custom", type]), priority };
    // The group key is derived from this exact custom event name.
    const invoke = (event: unknown) => handle(event as CustomEvents[K]);
    return observer
      ? this.dispatcher.observe(definition, invoke)
      : this.dispatcher.register(definition, invoke);
  }

  /**
   * Retains one native listener for the group's registrations across attachments.
   *
   * @param group - Exact native event target, name and phase.
   * @returns The group retains its native queue until its final registration is removed.
   * @throws If native listener installation fails on an attached root.
   */
  private connect(group: BrowserEventGroup): void {
    if (!group.release) {
      group.release = this.listeners.register(group, (event, identity) =>
        this.dispatch(group, event, identity ?? event),
      );
    }
  }

  /**
   * Delivers a stable registration snapshot in descending priority order.
   *
   * @param group - Listener group receiving this native event.
   * @param event - Normalized browser input; cancellation remains callback-owned.
   * @param identity - Opaque identity of this native dispatch.
   * @returns Eligible callbacks have run until one claims the group delivery.
   * @throws Propagates callback failures without invoking later callbacks.
   */
  private dispatch(
    group: BrowserEventGroup,
    event: BrowserInputMap[keyof BrowserInputMap],
    identity: object,
  ): void {
    const key = JSON.stringify([
      group.type,
      group.target,
      group.capture,
      group.passive,
      group.includeNested ?? false,
    ]);
    const delivery = this.dispatcher.begin(identity);
    delivery.observe(key, event);
    delivery.dispatch(key, event);
  }
}
