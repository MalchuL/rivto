import { EventDispatcher } from "../../events/event-dispatcher";
import type {
  BrowserListenerCapture,
  BrowserListenerControl,
  BrowserListenerGroup,
  BrowserListenerRoot,
  BrowserRoutedEventDefinition,
  BrowserRoutedEventFactory,
} from "../../events/types";
import { BrowserEventListeners } from "../input/browser-event-listeners";
import type { BrowserRoutedDelivery, BrowserRoutedEntry } from "./types";

/**
 * Identifies registrations sharing a browser listener and delivery group.
 *
 * @param group - Listener realm, input name, and browser options.
 * @returns Stable group identity shared across registration and delivery.
 */
function groupKey(group: BrowserListenerGroup): string {
  return JSON.stringify([group.target, group.type, group.capture, group.passive]);
}

/** Owns browser listeners and ordered routed delivery across mounted occurrences. */
export class BrowserRoutedEvents<EventValue> {
  private readonly dispatcher = new EventDispatcher<
    Record<string, BrowserRoutedDelivery<EventValue>>
  >();
  private readonly claimed = new WeakSet<object>();
  private readonly listeners: BrowserEventListeners;
  private entries: readonly BrowserRoutedEntry[] = [];
  private reconciliation = 0;
  private destroyed = false;

  /**
   * Creates a multi-occurrence listener owner without attaching browser listeners.
   *
   * @param getRoots - Reads the host's current borrowed occurrences when reconciling.
   * @param createEvent - Resolves one receiving host context for each listener group.
   * @param requiredGroups - Listener groups copied for use while any occurrence is registered.
   */
  constructor(
    private readonly getRoots: () => ReadonlySet<BrowserListenerRoot>,
    private readonly createEvent: BrowserRoutedEventFactory<EventValue>,
    requiredGroups: readonly BrowserListenerGroup[],
  ) {
    this.listeners = new BrowserEventListeners(
      (group, root, capture, identity, control) =>
        this.dispatch(group, root, capture, identity, control),
      requiredGroups.map((group) => ({ ...group })),
      true,
    );
  }

  /**
   * Registers a routed browser handler and reconciles its native listener group.
   *
   * Additions during an input wait for the next dispatch; removals immediately
   * exclude the handler from a retained snapshot. A handled input is claimed
   * across listener groups and may request browser-default cancellation. Listener
   * options are copied at registration and do not follow later caller mutation.
   *
   * @param definition - Unique identity, listener options, and cancellation policy.
   * @param handler - Receives host context and returns true when it handles input.
   * @returns Idempotent cleanup removing this exact registration.
   * @throws If destroyed, identity is invalid or duplicate, or listener setup fails.
   */
  register(
    definition: BrowserRoutedEventDefinition,
    handler: (event: EventValue) => boolean | void,
  ): () => void {
    if (this.destroyed) {
      throw new Error("Routed browser events are destroyed");
    }
    const captured = { ...definition };
    const release = this.dispatcher.register(
      { id: captured.id, type: groupKey(captured) },
      (delivery) => {
        if (
          this.destroyed ||
          delivery.control.isDefaultPrevented() ||
          this.claimed.has(delivery.identity)
        ) {
          return "handled";
        }
        if (handler(delivery.event)) {
          if (captured.preventDefault && !captured.passive) {
            delivery.control.preventDefault();
          }
          this.claimed.add(delivery.identity);
          return "handled";
        }
      },
    );
    const entry: BrowserRoutedEntry = { definition: captured, release, active: true };
    this.entries = [...this.entries, entry];
    try {
      this.reconcile();
      if (!entry.active) {
        throw new Error("Routed browser registration was destroyed during setup");
      }
    } catch (error) {
      try {
        this.remove(entry);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Browser event registration rollback failed",
        );
      }
      throw error;
    }
    return () => this.remove(entry);
  }

  /**
   * Reconciles listener groups against the host's current mounted occurrences.
   *
   * @returns Required listeners are attached and obsolete listeners are removed.
   * @throws Propagates Root lookup, browser attachment, or cleanup failures.
   */
  reconcile(): void {
    if (this.destroyed) {
      return;
    }
    const reconciliation = ++this.reconciliation;
    const groups = this.entries.map((entry) => entry.definition);
    const roots = this.getRoots();
    if (!this.destroyed && this.reconciliation === reconciliation) {
      this.listeners.connect(groups, roots);
    }
  }

  /**
   * Invalidates registrations and disconnects all owned browser listeners.
   *
   * @returns Retained handlers are ineligible and native listener cleanup is attempted once.
   * @throws Propagates browser listener cleanup failures.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.reconciliation++;
    for (const entry of this.entries) {
      entry.active = false;
      entry.release();
    }
    this.entries = [];
    this.listeners.disconnect();
  }

  /**
   * Removes one registration before reconciling its obsolete browser listeners.
   *
   * @param entry - Exact registration being released.
   * @returns The handler is ineligible and its listener groups are reconciled.
   * @throws Propagates browser listener reconciliation failures.
   */
  private remove(entry: BrowserRoutedEntry): void {
    if (!entry.active) {
      return;
    }
    entry.active = false;
    entry.release();
    this.entries = this.entries.filter((current) => current !== entry);
    this.reconcile();
  }

  /**
   * Captures a stable registration snapshot and delivers one browser listener group.
   *
   * @param group - Listener realm, input name, and browser options.
   * @param rootIdentity - Surface identity, or undefined for document and window delivery.
   * @param capture - Occurrence-bound normalized input capture.
   * @param identity - Opaque identity shared by this browser dispatch's phases.
   * @param control - Pointer ownership and synchronous browser cancellation.
   * @returns Eligible routed handlers have run until one claims the input.
   * @throws Propagates host routing and handler failures.
   */
  private dispatch(
    group: BrowserListenerGroup,
    rootIdentity: object | undefined,
    capture: BrowserListenerCapture,
    identity: object,
    control: BrowserListenerControl,
  ): void {
    if (this.destroyed || control.isDefaultPrevented() || this.claimed.has(identity)) {
      return;
    }
    const delivery = this.dispatcher.begin(identity);
    const event = this.createEvent(group, rootIdentity, capture, identity, control);
    if (event !== undefined) {
      delivery.dispatch(groupKey(group), { event, identity, control });
    }
  }
}
