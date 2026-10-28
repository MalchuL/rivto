import type { RegistrationOwner } from "../extensions/types";
import { DOMEventListeners } from "./dom-event-listeners";
import type { AnyEditorEvent, DOMRegistration, NativeListenerGroup } from "./types";
/**
 * Browser event registration and dispatch. Event payloads identify the receiving
 * panel and its selection; document mutations still go through core managers.
 */
import type { DOMEventDefinition, DOMEventName, DOMEventTarget } from "./dom-types";
import type { EditorEvent } from "./editor-event";
import { PanelEventFactory } from "./panel-event-factory";
import type { PanelRegistry } from "../../panels/panel-registry";
import type { EditorEventHandler } from "./types";
import type { PanelRegistration } from "../../panels/types";

/**
 * Registers and dispatches browser events for all panels of one document.
 *
 * DOMEventListeners attaches the native listeners. PanelRegistry chooses the
 * receiving panel through PanelEventFactory, which captures its EditorEvent context.
 * This manager runs matching handlers
 * in registration order. A handled event is not offered to later registrations.
 * One native event retains its initial registrations across capture and bubbling;
 * additions wait for a later event, while removals take effect immediately.
 * KeyboardManager defines keyboard actions and registers its keydown and keyup
 * handlers here, on the editor surface or window.
 */
export class EventManager {
  private registrations: readonly DOMRegistration[] = [];
  private readonly eventRegistrations = new WeakMap<Event, readonly DOMRegistration[]>();
  private readonly registrationIds = new Set<string>();
  private readonly registrationDisposers = new Map<string, () => void>();
  private readonly listeners = new DOMEventListeners((group, event, root) =>
    this.dispatch(group, event, root),
  );
  private readonly eventFactory: PanelEventFactory;
  private readonly panels: Pick<PanelRegistry, "subscribeRoots" | "getRoots">;
  private readonly unsubscribeRoots: () => void;
  private readonly claimedEvents = new WeakSet<globalThis.Event>();
  private destroyed = false;

  /**
   * Creates the browser-event runtime before extensions are installed.
   *
   * @param panels - Borrowed mounted-root routing and panel context, without lifecycle ownership.
   * @param extensions - Internal registration ownership and destruction guard.
   */
  constructor(
    panels: Pick<
      PanelRegistry,
      "subscribeRoots" | "getRoots" | "resolveEventRoot" | "getApi" | "getSurfaceType"
    >,
    private readonly extensions: RegistrationOwner,
  ) {
    this.panels = panels;
    this.eventFactory = new PanelEventFactory(panels);
    this.unsubscribeRoots = this.panels.subscribeRoots(() => this.reconnectListeners());
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
   * @param owner - Optional panel restricting dispatch to its root and prefixing the ID.
   * The caller must also retain the disposer for panel cleanup.
   * @returns Idempotent disposer, also owned by the registering extension.
   * @throws If the ID is empty, already registered in its scope, or the runtime is destroyed.
   * Native attachment or cleanup ownership failures propagate; rollback failures are aggregated.
   */
  register<
    Target extends DOMEventTarget = "surface",
    Type extends DOMEventName<Target> = DOMEventName<Target>,
  >(
    definition: DOMEventDefinition<Target, Type>,
    listener: EditorEventHandler<EditorEvent<Target, Type>>,
    owner?: Pick<PanelRegistration, "id" | "getRoot">,
  ): () => void;

  /**
   * Registers a DOM handler with optional panel ownership and reconnects native listeners.
   *
   * @param definition - Registration definition with its stable ID, filters, and options.
   * @param listener - DOM event handler; a truthy result claims the event.
   * @param owner - Optional panel registration that scopes the handler to one mounted root.
   * @returns Idempotent cleanup owned by the extension runtime.
   * @throws If the runtime is inactive, the ID is blank, or its scoped registration already exists.
   * Setup failures roll back the registration; setup and rollback errors are retained together.
   */
  register(
    definition: DOMEventDefinition,
    listener: EditorEventHandler<AnyEditorEvent>,
    owner?: Pick<PanelRegistration, "id" | "getRoot">,
  ): () => void {
    this.assertActive();
    const id = owner ? `${owner.id}:${definition.id.trim()}` : definition.id.trim();
    if (!definition.id.trim()) {
      throw new Error("Event registration ID is required");
    }
    if (this.registrationIds.has(id)) {
      throw new Error(`Event registration ${id} is already registered`);
    }

    const registration = { ...this.createRegistration({ ...definition, id }, listener), owner };
    this.registrationIds.add(id);
    this.registrations = [...this.registrations, registration];
    try {
      this.reconnectListeners();
      const dispose = this.extensions.registerCleanup(() => this.removeRegistration(registration));
      this.registrationDisposers.set(id, dispose);
      return dispose;
    } catch (error) {
      try {
        this.removeRegistration(registration);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Event registration rollback failed");
      }
      throw error;
    }
  }

  /**
   * Deletes one DOM registration by its stable ID.
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
    // Invalidate retained dispatch snapshots before any cleanup can throw or reenter.
    for (const registration of this.registrations) {
      registration.active = false;
    }
    this.registrationDisposers.clear();
    this.registrationIds.clear();
    this.registrations = [];
    const errors: unknown[] = [];
    for (const release of [
      () => this.listeners.disconnect(),
      this.unsubscribeRoots,
      ...disposers,
    ]) {
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
   * Removes one exact registration before reconciling its native listener groups.
   *
   * State is released before native cleanup, so errors cannot reserve its ID or
   * leave it eligible in an ongoing dispatch. Old disposers cannot remove replacements.
   *
   * @param registration - Registration being disposed or rolled back after failed setup.
   * @returns The handler and its ID are released; repeated removal does nothing.
   * @throws Propagates listener reconciliation failures after unregistering the handler.
   */
  private removeRegistration(registration: DOMRegistration): void {
    if (!registration.active) {
      return;
    }
    registration.active = false;
    this.registrations = this.registrations.filter((entry) => entry !== registration);
    this.registrationIds.delete(registration.id);
    this.registrationDisposers.delete(registration.id);
    this.reconnectListeners();
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
   * Connects current registrations to panel roots, or disconnects listeners after destruction.
   */
  private reconnectListeners(): void {
    if (this.destroyed) {
      this.listeners.disconnect();
    } else {
      this.listeners.connect(this.registrations, this.panels.getRoots());
    }
  }

  /**
   * Runs matching registrations for one native event until one claims it.
   *
   * @param group - Capture/passive/target identity of the native listener.
   * @param raw - Browser event dispatched to that listener.
   * @param attachedRoot - Surface listener root; omitted for document/window listeners.
   * @returns Matching registrations have run unless the event was already claimed.
   * @throws Propagates routing, predicate and handler failures.
   */
  private dispatch(
    group: NativeListenerGroup,
    raw: globalThis.Event,
    attachedRoot?: HTMLElement,
  ): void {
    if (this.destroyed || raw.defaultPrevented || this.claimedEvents.has(raw)) {
      return;
    }
    let registrations = this.eventRegistrations.get(raw);
    if (!registrations) {
      registrations = this.registrations;
      this.eventRegistrations.set(raw, registrations);
    }
    const event = this.eventFactory.create(group.target, raw, attachedRoot);
    if (event) {
      this.dispatchRegistrations(group, event, registrations);
    }
  }

  /**
   * Dispatches a native event to matching panel, scope, mode, and listener-option registrations until handled.
   *
   * @param group - Native listener group defining target, event type, capture, and passive options.
   * @param event - Receiving panel context and selection snapshot for this native group.
   * @param registrations - Initial registration array shared by all phases of this native event.
   * @returns Eligible active handlers have run until one claims the event.
   * @throws Propagates availability-predicate and handler failures.
   */
  private dispatchRegistrations(
    group: NativeListenerGroup,
    event: AnyEditorEvent,
    registrations: readonly DOMRegistration[],
  ): void {
    const raw: Event = event.raw;
    const root = event.root;
    // Pointermove can fire hundreds of times per gesture: arrays are copied only
    // when registrations change, not for each dispatch. Every native phase shares
    // this event's original array; active flags make removals effective immediately.
    for (const registration of registrations) {
      if (this.destroyed || raw.defaultPrevented || this.claimedEvents.has(raw)) {
        return;
      }
      if (
        !registration.active ||
        (registration.owner && registration.owner.getRoot() !== root) ||
        registration.type !== group.type ||
        registration.target !== group.target ||
        registration.capture !== group.capture ||
        registration.passive !== group.passive ||
        !event.matches(registration) ||
        (registration.when && !registration.when(event))
      ) {
        continue;
      }
      // The availability predicate may remove this registration itself.
      if (registration.active && registration.listener(event)) {
        this.markHandled(raw, registration.preventDefault && !registration.passive);
        return;
      }
    }
  }

  /**
   * Marks a native event claimed and optionally prevents its default when cancellation is supported.
   *
   * @param raw - Original browser event being dispatched.
   * @param preventDefault - Whether to prevent the native default when the event is cancelable.
   */
  private markHandled(raw: globalThis.Event, preventDefault: boolean): void {
    if (preventDefault && raw.cancelable) {
      raw.preventDefault();
    }
    this.claimedEvents.add(raw);
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
}
