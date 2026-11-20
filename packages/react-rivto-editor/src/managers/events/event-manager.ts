import { EventDispatcher, type EventResult, type CustomEventDefinition } from "@chulane/rivto-root";
import type { RegistrationOwner } from "../extensions/types";
import { BrowserRoutedEvents } from "@chulane/rivto-root/browser";
import type {
  AnyEditorEvent,
  DOMEventDefinition,
  DOMEventName,
  DOMEventTarget,
  EditorEventHandler,
  DOMRegistration,
  CustomEventPayloads,
} from "./types";
/**
 * Browser event registration and dispatch. Event payloads identify the receiving
 * panel and its selection; document mutations still go through core managers.
 */
import type { EditorEvent } from "./editor-event";
import { PanelEventFactory } from "./panel-event-factory";
import type { PanelRegistry } from "../../panels/panel-registry";
import type { PanelRegistration } from "../../panels/types";

/**
 * Registers and dispatches browser events for all panels of one document.
 *
 * BrowserRoutedEvents attaches native listeners and owns grouped delivery. PanelRegistry chooses the
 * receiving panel through PanelEventFactory, which captures its EditorEvent context.
 * The shared dispatcher runs matching handlers in registration order. A handled event is not offered to later registrations.
 * One native event retains its initial registrations across capture and bubbling;
 * additions wait for a later event, while removals take effect immediately.
 * KeyboardManager defines keyboard actions and registers its keydown and keyup
 * handlers here, on the editor surface or window.
 */
export class EventManager<CustomEvents extends object = object> {
  private readonly dispatcher = new EventDispatcher<CustomEventPayloads>();
  private readonly registrationIds = new Set<string>();
  private readonly registrationDisposers = new Map<string, () => void>();
  private readonly listeners: BrowserRoutedEvents<AnyEditorEvent>;
  private readonly unsubscribeRoots: () => void;
  private destroyed = false;

  /**
   * Creates the browser-event runtime before extensions are installed.
   *
   * @param panels - Borrowed mounted-root routing and panel context, without lifecycle ownership.
   * @param extensions - Internal registration ownership and destruction guard.
   */
  constructor(
    panels: Pick<PanelRegistry, "subscribeRoots" | "getInputRoots" | "resolveEventPanel">,
    private readonly extensions: RegistrationOwner,
  ) {
    const eventFactory = new PanelEventFactory(panels);
    this.listeners = new BrowserRoutedEvents(
      () => panels.getInputRoots(),
      (group, root, capture, identity, control) =>
        eventFactory.create(group.target, group.type, root, capture, identity, control),
      [
        { target: "surface", type: "focusin", capture: false, passive: false },
        { target: "surface", type: "pointerdown", capture: false, passive: false },
        { target: "window", type: "pointerup", capture: false, passive: false },
        { target: "window", type: "pointercancel", capture: false, passive: false },
      ],
    );
    this.unsubscribeRoots = panels.subscribeRoots(() => this.listeners.reconcile());
  }

  /**
   * Registers a typed delegated DOM event.
   *
   * @param definition - Stable ID, native event type, target, and optional filters.
   * The target defaults to the surface; capture and passive default to false.
   * @param listener - Handler returning true when it handled the event. This stops
   * later editor handlers and prevents the browser default when cancellation is allowed,
   * unless definition.preventDefault is false (for native gesture-library event streams).
   * DOM propagation is not stopped. Passive listeners cannot cancel browser defaults.
   * Registrations added during native delivery start with a later native event;
   * removing a handler immediately excludes it, including from later event phases.
   * Failed setup removes the new handler and frees its ID before rethrowing.
   * If rollback also fails, both failures are retained in AggregateError.
   * @param owner - Optional panel restricting dispatch to its current input registration and prefixing the ID.
   * The caller must also retain the disposer for panel cleanup.
   * @returns Idempotent disposer, also owned by the registering extension.
   * @throws If the ID is empty, already registered in its scope, or the runtime is destroyed.
   * Native attachment or cleanup ownership failures propagate; rollback failures are aggregated.
   */
  register<Target extends DOMEventTarget = "surface", Type extends DOMEventName = DOMEventName>(
    definition: DOMEventDefinition<Target, Type>,
    listener: EditorEventHandler<EditorEvent<Target, Type>>,
    owner?: Pick<PanelRegistration, "id" | "inputRoot">,
  ): () => void;

  /**
   * Registers a typed custom event handler in the current extension scope.
   *
   * @param definition - Custom event identity, name and optional priority.
   * @param listener - Typed callback returning handled to claim delivery.
   * @returns Idempotent disposer releasing this exact registration.
   * @throws If the manager is inactive or the identity or priority is invalid.
   */
  register<K extends Extract<keyof CustomEvents, string>>(
    definition: CustomEventDefinition<K>,
    listener: (event: CustomEvents[K]) => EventResult | void,
  ): () => void;

  /**
   * Registers a DOM handler with optional panel ownership and reconnects native listeners.
   *
   * @param definition - Registration definition with its stable ID, filters, and options.
   * @param listener - DOM event handler; a truthy result claims the event.
   * @param owner - Optional panel registration that scopes the handler to its current input capability.
   * @returns Idempotent cleanup owned by the extension runtime.
   * @throws If the runtime is inactive, the ID is blank, or its scoped registration already exists.
   * Setup failures roll back the registration; setup and rollback errors are retained together.
   */
  register(
    definition: DOMEventDefinition | CustomEventDefinition<Extract<keyof CustomEvents, string>>,
    listener: (event: never) => EventResult | boolean | void,
    owner?: Pick<PanelRegistration, "id" | "inputRoot">,
  ): () => void {
    if ("kind" in definition) {
      // The custom overload restricts this callback to explicit event results.
      return this.registerCustom(
        definition,
        listener as (event: never) => EventResult | void,
        false,
      );
    }
    this.assertActive();
    const id = owner ? `${owner.id}:${definition.id.trim()}` : definition.id.trim();
    if (!definition.id.trim()) {
      throw new Error("Event registration ID is required");
    }
    if (this.registrationIds.has(id)) {
      throw new Error(`Event registration ${id} is already registered`);
    }

    const registration = {
      ...this.createRegistration(
        { ...definition, id },
        listener as EditorEventHandler<AnyEditorEvent>,
      ),
      owner,
    };
    this.registrationIds.add(id);
    return this.installBrowserRegistration(registration);
  }

  /**
   * Observes a typed custom event before its handlers without claiming delivery.
   *
   * @param definition - Custom event identity, name and optional priority.
   * @param observer - Typed observer receiving the producer's payload.
   * @returns Idempotent disposer owned by the current extension.
   * @throws If the manager is inactive or the identity or priority is invalid.
   */
  observe<K extends Extract<keyof CustomEvents, string>>(
    definition: CustomEventDefinition<K>,
    observer: (event: CustomEvents[K]) => void,
  ): () => void {
    return this.registerCustom(definition, observer as (event: never) => void, true);
  }

  /**
   * Delivers a typed custom payload independently of panel attachment.
   *
   * Extensions borrow registration and observation only; the owning runtime
   * retains the concrete manager and publishing capability.
   *
   * @param type - Custom event name declared by the runtime owner.
   * @param payload - Producer-owned value associated with that name.
   * @returns Handled when a handler claims delivery, otherwise continue.
   * @throws If destroyed or an observer or handler throws.
   */
  publish<K extends Extract<keyof CustomEvents, string>>(
    type: K,
    payload: CustomEvents[K],
  ): EventResult {
    this.assertActive();
    return this.dispatcher.dispatch(JSON.stringify(["custom", type]), payload);
  }

  /**
   * Deletes one browser or custom event registration by its stable ID.
   *
   * @param id - Registered ID, including the panel prefix for a panel-owned registration.
   * @returns True when a registration existed and was disposed.
   */
  delete(id: string): boolean {
    const dispose = this.registrationDisposers.get(id);
    if (!dispose) {
      return false;
    }
    dispose();
    return true;
  }

  /**
   * Disconnects native listeners and root notifications, then disposes registrations.
   *
   * Registrations release in reverse order. Repeated calls do nothing; removal
   * also excludes registrations from any native event currently being dispatched.
   * Every native, root subscription and registration cleanup is attempted even
   * when another fails; dispatch is disabled before cleanup begins.
   *
   * @returns All owned cleanup has been attempted and registrations are forgotten.
   * @throws AggregateError containing native listener, subscription or registration cleanup failures.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const disposers = [...this.registrationDisposers.values()].reverse();
    this.registrationDisposers.clear();
    this.registrationIds.clear();
    const errors: unknown[] = [];
    for (const release of [() => this.listeners.destroy(), this.unsubscribeRoots, ...disposers]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Event cleanup failed");
    }
  }

  /**
   * Installs a browser registration and owns rollback through extension cleanup.
   *
   * The registration ID is reserved before installation and released if setup fails.
   *
   * @param registration - Validated panel-scoped browser registration.
   * @returns Idempotent cleanup owned by the extension runtime.
   * @throws Propagates listener or ownership failures; rollback failures are aggregated.
   */
  private installBrowserRegistration(registration: DOMRegistration): () => void {
    const id = registration.id;
    let releaseEntry: (() => void) | undefined;
    try {
      releaseEntry = this.listeners.register(
        {
          id,
          type: registration.type,
          target: registration.target,
          capture: registration.capture,
          passive: registration.passive,
          preventDefault: registration.preventDefault,
        },
        (event) => this.dispatchRegistration(registration, event),
      );
      const release = releaseEntry;
      const dispose = this.extensions.registerCleanup(() =>
        this.removeRegistration(registration, release),
      );
      this.registrationDisposers.set(id, dispose);
      return dispose;
    } catch (error) {
      try {
        if (releaseEntry) {
          this.removeRegistration(registration, releaseEntry);
        } else {
          registration.active = false;
          this.registrationIds.delete(id);
        }
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Event registration rollback failed");
      }
      throw error;
    }
  }

  /**
   * Removes one exact registration before reconciling its native listener groups.
   *
   * State is released before native cleanup, so errors cannot reserve its ID or
   * leave it eligible in an ongoing dispatch. Old disposers cannot remove replacements.
   *
   * @param registration - Registration being disposed or rolled back after failed setup.
   * @param releaseEntry - Dispatcher disposer for this exact registration.
   * @returns The handler and its ID are released; repeated removal does nothing.
   * @throws Propagates listener reconciliation failures after unregistering the handler.
   */
  private removeRegistration(registration: DOMRegistration, releaseEntry: () => void): void {
    if (!registration.active) {
      return;
    }
    registration.active = false;
    this.registrationIds.delete(registration.id);
    this.registrationDisposers.delete(registration.id);
    releaseEntry();
  }

  /**
   * Normalizes a DOM event definition, including surface targeting and listener option defaults.
   *
   * @param definition - Registration definition with its stable ID, filters, and options.
   * @param listener - Handler to store in the normalized DOM registration.
   * @returns Internal registration used for native event dispatch.
   */
  private createRegistration(
    definition: DOMEventDefinition,
    listener: EditorEventHandler<AnyEditorEvent>,
  ): DOMRegistration {
    return {
      id: definition.id,
      active: true,
      type: definition.type,
      target: definition.target ?? "surface",
      scope: definition.scope,
      listener,
      mode: definition.mode,
      capture: definition.capture ?? false,
      passive: definition.passive ?? false,
      preventDefault: definition.preventDefault !== false,
      when: definition.when as ((event: AnyEditorEvent) => boolean) | undefined,
    };
  }

  /**
   * Checks one registration against its receiving panel and event context.
   *
   * Root already matched target, event type, capture, and passive options and
   * owns cancellation for the synchronous delivery. The availability predicate
   * can remove its own registration. Nested events retain independent claims.
   *
   * @param registration - Captured host registration in its native listener group.
   * @param event - Receiving panel context and selection snapshot for this group.
   * @returns True when the eligible handler claims delivery, otherwise false.
   * @throws If a predicate, Root ownership check, or handler fails.
   */
  private dispatchRegistration(registration: DOMRegistration, event: AnyEditorEvent): boolean {
    if (
      this.destroyed ||
      !registration.active ||
      !event.inputRegistration.isCurrent(event.inputRoot) ||
      !event.inputRoot.isAttached() ||
      !event.inputRegistration.isCurrent(event.inputRoot) ||
      (registration.owner && registration.owner.inputRoot !== event.inputRoot) ||
      !event.matches(registration) ||
      (registration.when && !registration.when(event))
    ) {
      return false;
    }
    // Root checks can synchronously destroy the runtime or remove this registration.
    return Boolean(
      !this.destroyed &&
      registration.active &&
      event.inputRegistration.isCurrent(event.inputRoot) &&
      event.inputRoot.isAttached() &&
      event.inputRegistration.isCurrent(event.inputRoot) &&
      !this.destroyed &&
      registration.active &&
      (!registration.owner || registration.owner.inputRoot === event.inputRoot) &&
      registration.listener(event),
    );
  }

  /**
   * Rejects event registration after runtime or extension destruction has started.
   *
   * @returns Registration can proceed when both owners are active.
   * @throws If this runtime or its extension registration owner is inactive.
   */
  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("Editor event runtime is destroyed");
    }
    this.extensions.assertActive();
  }

  /**
   * Captures one custom callback in the current extension's registration scope.
   *
   * @param definition - Custom event name, identity and optional priority.
   * @param callback - Callback selected by the public typed overload.
   * @param observer - Whether delivery observes without claiming the event.
   * @returns Idempotent disposer releasing the identity and dispatcher entry.
   * @throws If registration is invalid or cleanup ownership fails.
   */
  private registerCustom(
    definition: CustomEventDefinition<Extract<keyof CustomEvents, string>>,
    callback: (event: never) => EventResult | void,
    observer: boolean,
  ): () => void {
    this.assertActive();
    const id = definition.id.trim();
    if (!id || this.registrationIds.has(id)) {
      throw new Error(`Invalid or duplicate event registration ${id}`);
    }
    const entry = {
      id,
      type: JSON.stringify(["custom", definition.type]),
      priority: definition.priority,
    };
    // The public overload pairs this callback with the declared custom event name.
    const invoke = (payload: unknown) => callback(payload as never);
    const release = observer
      ? this.dispatcher.observe(entry, invoke)
      : this.dispatcher.register(entry, invoke);
    this.registrationIds.add(id);
    try {
      const dispose = this.extensions.registerCleanup(() => {
        release();
        this.registrationIds.delete(id);
        this.registrationDisposers.delete(id);
      });
      this.registrationDisposers.set(id, dispose);
      return dispose;
    } catch (error) {
      release();
      this.registrationIds.delete(id);
      throw error;
    }
  }
}
