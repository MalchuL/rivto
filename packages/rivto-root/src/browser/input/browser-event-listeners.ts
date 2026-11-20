import type { BrowserListenerConnection } from "./types";
import { captureBrowserInput } from "./capture-browser-input";
import { BrowserEventControl } from "./browser-listener-control";
import { retainPointerDispatchBoundary } from "./pointer-dispatch-boundary";
import { getBrowserInputRootElement } from "./browser-input-root-elements";
import { inputElementIdentity } from "./input-element-identity";
import type {
  BrowserListenerDispatch,
  BrowserListenerGroup,
  BrowserListenerRoot,
} from "../../events/types";

/** Pointer phases that share the gesture's captured owner. */
const POINTER_CONTINUATIONS = new Set(["pointermove", "pointerup", "pointercancel"]);
const SUPERSEDED_RECONCILIATION = Symbol("superseded reconciliation");

/**
 * Resolves active browser occurrences before changing listener ownership.
 *
 * @param roots - Borrowed occurrences whose native listeners are required.
 * @returns Mounting elements and their borrowed occurrences in registration order.
 * @throws If an occurrence is detached, unsupported, or its owner check fails.
 */
function groupInputRootsByElement(
  roots: ReadonlySet<BrowserListenerRoot>,
): Map<HTMLElement, BrowserListenerRoot[]> {
  const elements = new Map<HTMLElement, BrowserListenerRoot[]>();
  for (const root of roots) {
    const element = getBrowserInputRootElement(root);
    if (!element || !root.isAttached()) {
      throw new Error("Browser event listeners require active browser roots");
    }
    const occurrences = elements.get(element) ?? [];
    occurrences.push(root);
    elements.set(element, occurrences);
  }
  return elements;
}

/**
 * Indexes borrowed occurrences by their surface, document, and window targets.
 *
 * @param roots - Active browser occurrences grouped by their mounting element.
 * @returns Target index used to guard delivery without scanning unrelated documents.
 * @throws Propagates browser document or window access failures.
 */
function indexInputTargets(
  roots: ReadonlyMap<HTMLElement, BrowserListenerRoot[]>,
): Map<EventTarget, BrowserListenerRoot[]> {
  const targets = new Map<EventTarget, BrowserListenerRoot[]>();
  for (const [element, occurrences] of roots) {
    const window = element.ownerDocument.defaultView;
    for (const target of [element, element.ownerDocument, window]) {
      if (!target) {
        continue;
      }
      const current = targets.get(target) ?? [];
      current.push(...occurrences);
      targets.set(target, current);
    }
  }
  return targets;
}

/**
 * Attaches and removes native browser listeners for a set of editor occurrences.
 *
 * Registrations with the same event type, target, capture, and passive options
 * share one listener per DOM target. Panels in the same document or window also
 * share those targets. The consumer decides which handlers receive each event;
 * this class forwards its listener options and optional opaque surface identity.
 */
export class BrowserEventListeners {
  private readonly connected = new Set<BrowserListenerConnection>();
  private reconciliation = 0;
  private readonly trackedTypes = new Set<string>();
  private readonly activeDispatches = new Map<string, Set<WeakRef<Event>>>();
  /** Surface index used to recognize nested roots in native composed paths. */
  private activeRoots = new Set<EventTarget>();
  /** Borrowed Roots indexed by native target for constant-time document lookup. */
  private activeTargets = new Map<EventTarget, BrowserListenerRoot[]>();
  private identities = new WeakMap<Event, object>();
  private windowEvents = new WeakSet<Event>();
  private rootEvents = new WeakSet<Event>();
  /**
   * Creates a listener owner for the consumer's native event groups.
   *
   * @param dispatch - Receives listener group, optional surface identity, and occurrence-bound normalization.
   * @param requiredGroups - Groups retained whenever at least one root is attached.
   * @param trackDispatch - Whether to provide an identity shared across listener groups; defaults to false.
   */
  constructor(
    private readonly dispatch: BrowserListenerDispatch,
    private readonly requiredGroups: readonly BrowserListenerGroup[],
    private readonly trackDispatch = false,
  ) {}
  /**
   * Reconciles native listeners with the current registrations and panel roots.
   *
   * Required listener groups are included even without other registrations, so panel activation and gesture cleanup still work. An empty root
   * set removes all listeners; roots without a window skip window registrations.
   * Unchanged listeners retain their identity so registration changes inside a
   * callback do not suppress pending delivery in other native groups. Failed
   * attachment removes only newly added connections, preserving prior listeners;
   * rollback errors are retained alongside the original installation failure.
   * When tracking is enabled, an unused type is released immediately unless its
   * dispatch is still in progress. An in-flight type remains until a subsequent
   * reconciliation or detachment so later native phases retain their identity.
   * A retained listener dispatches only while its native target still has an
   * attached occurrence, even if reconciliation has not yet removed it.
   * If an ownership check starts another reconciliation or disconnects this
   * listener set, the older preparation does not overwrite that newer state.
   * If installation is superseded, its newly attached listener or shared
   * pointer-boundary lease is released before the older reconciliation stops.
   *
   * @param registrations - Event types, targets, and listener options to group.
   * @param roots - Active browser occurrences whose documents and windows receive listeners.
   * @returns Required listeners are attached and obsolete connections are removed.
   * @throws If a root is detached or unsupported, on native installation failures,
   * or AggregateError retaining rollback or removal failures.
   */
  connect(
    registrations: readonly BrowserListenerGroup[],
    roots: ReadonlySet<BrowserListenerRoot>,
  ): void {
    const reconciliation = ++this.reconciliation;
    if (!roots.size) {
      this.disconnect();
      return;
    }
    const elements = groupInputRootsByElement(roots);
    const targets = indexInputTargets(elements);
    if (this.reconciliation !== reconciliation) {
      return;
    }
    const previous = new Set(this.connected);
    const previousRoots = this.activeRoots;
    const previousTargets = this.activeTargets;
    const previousTypes = new Set(this.trackedTypes);
    this.activeRoots = new Set(elements.keys());
    this.activeTargets = targets;
    let used: Set<BrowserListenerConnection>;
    try {
      used = this.connectGroups(registrations, new Set(elements.keys()));
    } catch (error) {
      if (this.reconciliation !== reconciliation) {
        if (error === SUPERSEDED_RECONCILIATION) {
          return;
        }
        throw error;
      }
      this.activeRoots = previousRoots;
      this.activeTargets = previousTargets;
      this.trackedTypes.clear();
      previousTypes.forEach((type) => this.trackedTypes.add(type));
      const added = [...this.connected].filter((connection) => !previous.has(connection));
      const errors = [error, ...this.releaseConnections(added)];
      if (errors.length > 1) {
        throw new AggregateError(errors, "Native listener attachment rollback failed");
      }
      throw error;
    }
    const unused = [...previous].filter((connection) => !used.has(connection));
    const errors = this.releaseConnections(unused);
    if (errors.length) {
      throw new AggregateError(errors, "Obsolete native listener cleanup failed");
    }
  }

  /**
   * Removes every native listener, including listeners shared by window/document roots.
   *
   * Every connection is disabled before its removal is attempted. A native target
   * that throws may retain its listener physically, but it can no longer dispatch.
   *
   * @returns All owned removals have been attempted; repeated disconnection is harmless.
   * @throws AggregateError containing every native listener removal failure.
   */
  disconnect(): void {
    this.reconciliation++;
    this.activeRoots.clear();
    this.activeTargets.clear();
    this.trackedTypes.clear();
    this.activeDispatches.clear();
    this.identities = new WeakMap();
    this.windowEvents = new WeakSet();
    this.rootEvents = new WeakSet();
    const errors = this.releaseConnections(this.connected);
    if (errors.length) {
      throw new AggregateError(errors, "Native listener cleanup failed");
    }
  }

  /**
   * Installs required groups while preserving unchanged native connection identities.
   *
   * @param registrations - Current event types and native options to group.
   * @param roots - Mounted roots whose surface, document and window receive events.
   * @returns Connections required by these roots, deduplicated across shared realms.
   * @throws Propagates installation failures for the caller to roll back.
   */
  private connectGroups(
    registrations: readonly BrowserListenerGroup[],
    roots: ReadonlySet<HTMLElement>,
  ): Set<BrowserListenerConnection> {
    const used = new Set<BrowserListenerConnection>();
    const groups = this.getGroups(registrations);
    const pointerTypes = new Set(
      groups.map((group) => group.type).filter((type) => POINTER_CONTINUATIONS.has(type)),
    );
    const pointerRootTypes = new Set(
      groups
        .filter((group) => group.target === "surface" && pointerTypes.has(group.type))
        .map((group) => group.type),
    );
    if (this.trackDispatch) {
      const currentTypes = new Set(groups.map((group) => group.type));
      for (const type of this.trackedTypes) {
        if (!currentTypes.has(type) && !this.hasActiveDispatch(type)) {
          this.trackedTypes.delete(type);
        }
      }
      groups.forEach((group) => this.trackedTypes.add(group.type));
      for (const type of this.trackedTypes) {
        if (POINTER_CONTINUATIONS.has(type)) {
          pointerTypes.add(type);
          if (
            this.hasActiveDispatch(type) &&
            [...this.connected].some(
              (connection) => connection.boundary === "pointer-root" && connection.type === type,
            )
          ) {
            pointerRootTypes.add(type);
          }
        }
      }
      this.connectBoundaries(roots, used);
    }
    this.connectPointerBoundaries(pointerTypes, pointerRootTypes, roots, used);
    for (const group of groups) {
      this.connectGroup(group, roots, used);
    }
    return used;
  }

  /**
   * Retains one listener group per distinct target in the participating roots.
   *
   * @param group - Native event name, target category, and listener options.
   * @param roots - Mounted occurrences providing the browser targets.
   * @param used - Connections retained by this reconciliation.
   * @returns Each available target has its listener included once.
   * @throws Propagates native listener installation failures.
   */
  private connectGroup(
    group: BrowserListenerGroup,
    roots: ReadonlySet<HTMLElement>,
    used: Set<BrowserListenerConnection>,
  ): void {
    const targets = new Set<EventTarget>();
    for (const root of roots) {
      let target: EventTarget | null = root;
      if (group.target === "document") {
        target = root.ownerDocument;
      } else if (group.target === "window") {
        target = root.ownerDocument.defaultView;
      }
      if (!target || targets.has(target)) {
        continue;
      }
      targets.add(target);
      used.add(this.connectListener(group, target, root));
    }
  }

  /**
   * Disables and removes each supplied native connection without stopping at errors.
   *
   * The entire retiring set is disabled first so a reentrant reconciliation
   * cannot retain a connection whose native listener is about to be removed.
   *
   * @param connections - Exact connections being disconnected or rolled back.
   * @returns Native removal failures in attempted cleanup order.
   */
  private releaseConnections(connections: Iterable<BrowserListenerConnection>): unknown[] {
    const errors: unknown[] = [];
    const retiring = [...connections];
    for (const connection of retiring) {
      this.connected.delete(connection);
    }
    for (const connection of retiring) {
      const { nativeTarget, type, listener, capture } = connection;
      try {
        if (connection.releaseBoundary) {
          connection.releaseBoundary();
        } else {
          nativeTarget.removeEventListener(type, listener, capture);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  /**
   * Retains shared pointer-dispatch boundaries for each participating realm.
   *
   * @param types - Pointer continuation names currently retained by this owner.
   * @param rootTypes - Pointer names with surface delivery, including in-flight types.
   * @param roots - Mounted occurrences participating in this listener set.
   * @param used - Connections retained by the current reconciliation.
   * @returns Shared window and occurrence boundaries are retained once per owner.
   * @throws Propagates native listener installation failures.
   */
  private connectPointerBoundaries(
    types: ReadonlySet<string>,
    rootTypes: ReadonlySet<string>,
    roots: ReadonlySet<HTMLElement>,
    used: Set<BrowserListenerConnection>,
  ): void {
    for (const type of types) {
      for (const root of roots) {
        const window = root.ownerDocument.defaultView;
        if (window) {
          used.add(this.connectPointerBoundary(type, window));
        }
        if (rootTypes.has(type)) {
          const tree = typeof root.getRootNode === "function" ? root.getRootNode() : root;
          if (tree !== root && tree !== root.ownerDocument) {
            used.add(this.connectPointerBoundary(type, tree, root));
          }
          used.add(this.connectPointerBoundary(type, root, root));
        }
      }
    }
  }

  /**
   * Retains this owner's reference to one shared native pointer boundary.
   *
   * @param type - Pointer continuation event name.
   * @param target - Window, disconnected tree, or occurrence receiving capture.
   * @param root - Occurrence owning a tree or root target; omitted for a window.
   * @returns Existing or newly retained connection.
   * @throws Propagates native listener installation failures.
   */
  private connectPointerBoundary(
    type: string,
    target: EventTarget,
    root?: HTMLElement,
  ): BrowserListenerConnection {
    const boundary = root ? "pointer-root" : "pointer-window";
    for (const connection of this.connected) {
      if (
        connection.boundary === boundary &&
        connection.type === type &&
        connection.nativeTarget === target
      ) {
        return connection;
      }
    }
    const reconciliation = this.reconciliation;
    const lease = retainPointerDispatchBoundary(target, type, root);
    if (this.reconciliation !== reconciliation) {
      lease.release();
      throw SUPERSEDED_RECONCILIATION;
    }
    const connection: BrowserListenerConnection = {
      type,
      target: root ? "surface" : "window",
      capture: true,
      passive: true,
      nativeTarget: target,
      listener: lease.listener,
      boundary,
      releaseBoundary: lease.release,
    };
    this.connected.add(connection);
    return connection;
  }

  /**
   * Groups registration options and retains the consumer-supplied required listeners.
   *
   * Descriptors contain native options only, so a retained listener does not keep
   * a removed registration's callback or extension alive.
   *
   * @param registrations - Current event names, targets and native listener options.
   * @returns One descriptor per native group, including the consumer-supplied required groups.
   */
  private getGroups(registrations: readonly BrowserListenerGroup[]): BrowserListenerGroup[] {
    const groups = new Map<string, BrowserListenerGroup>();
    for (const { target, type, capture, passive } of [...registrations, ...this.requiredGroups]) {
      const key = [target, type, capture, passive].join(":");
      if (!groups.has(key)) {
        groups.set(key, { target, type, capture, passive });
      }
    }
    return [...groups.values()];
  }

  /**
   * Retains an unchanged native listener or attaches a newly required group.
   *
   * Replacing an unchanged listener during dispatch would remove it from the
   * browser's pending delivery list, skipping handlers in later listener groups.
   *
   * @param group - Stable event name, target category, capture and passive options.
   * @param nativeTarget - Root, document or window receiving the native listener.
   * @param root - Panel root supplied only for surface routing, never global delivery.
   * @returns The retained or newly installed connection owned by this listener set.
   * @throws Propagates native listener installation failures.
   */
  private connectListener(
    group: BrowserListenerGroup,
    nativeTarget: EventTarget,
    root: HTMLElement,
  ): BrowserListenerConnection {
    for (const connection of this.connected) {
      if (
        connection.nativeTarget === nativeTarget &&
        !connection.boundary &&
        connection.target === group.target &&
        connection.type === group.type &&
        connection.capture === group.capture &&
        connection.passive === group.passive
      ) {
        return connection;
      }
    }
    const rootIdentity = group.target === "surface" ? inputElementIdentity(root) : undefined;
    const listener: EventListener = (event) => {
      if (
        this.connected.has(connection) &&
        this.hasAttachedRoot(nativeTarget) &&
        this.connected.has(connection)
      ) {
        let delivering = true;
        try {
          this.dispatch(
            group,
            rootIdentity,
            (receivingRoot) => {
              const element = getBrowserInputRootElement(receivingRoot);
              if (!element || !receivingRoot.isAttached()) {
                return undefined;
              }
              const input = captureBrowserInput(
                event,
                element,
                () => receivingRoot.isAttached(),
                () => delivering,
              );
              return receivingRoot.isAttached() ? input : undefined;
            },
            this.getDispatchIdentity(event),
            new BrowserEventControl(event, root),
          );
        } finally {
          delivering = false;
        }
      }
    };
    const connection = { ...group, nativeTarget, listener };
    const reconciliation = this.reconciliation;
    nativeTarget.addEventListener(group.type, listener, {
      capture: group.capture,
      passive: group.passive,
    });
    if (this.reconciliation !== reconciliation) {
      nativeTarget.removeEventListener(group.type, listener, group.capture);
      throw SUPERSEDED_RECONCILIATION;
    }
    this.connected.add(connection);
    return connection;
  }

  /**
   * Retains one window and one root capture boundary per known input type.
   *
   * An in-flight type remains tracked until a later reconciliation or detach so
   * registration changes cannot discard its identity before another native phase.
   *
   * @param roots - Current mounted occurrences and their browser realms.
   * @param used - Set receiving retained or newly attached boundary connections.
   * @returns All required identity boundaries are included in the reconciliation.
   * @throws Propagates browser listener installation failures for rollback.
   */
  private connectBoundaries(
    roots: ReadonlySet<HTMLElement>,
    used: Set<BrowserListenerConnection>,
  ): void {
    for (const type of this.trackedTypes) {
      const windows = new Set<EventTarget>();
      for (const root of roots) {
        const window = root.ownerDocument.defaultView;
        if (window && !windows.has(window)) {
          windows.add(window);
          used.add(this.connectBoundary(type, "window", window, root));
        }
        used.add(this.connectBoundary(type, "root", root, root));
      }
    }
  }

  /**
   * Installs or retains one native capture boundary for dispatch identities.
   *
   * Window capture starts connected deliveries. For disconnected roots or a
   * listener installed after window capture, the first reached root starts the
   * delivery so nested roots do not replace its identity. Boundaries are passive
   * because they never cancel browser input.
   *
   * @param type - Browser input name to track.
   * @param boundary - Window or occurrence boundary receiving capture.
   * @param nativeTarget - Browser object where the listener is installed.
   * @param root - Occurrence providing the document realm for path checks.
   * @returns Retained connection owned by this listener set.
   * @throws Propagates native listener installation failures.
   */
  private connectBoundary(
    type: string,
    boundary: "window" | "root",
    nativeTarget: EventTarget,
    root: HTMLElement,
  ): BrowserListenerConnection {
    for (const connection of this.connected) {
      if (
        connection.boundary === boundary &&
        connection.type === type &&
        connection.nativeTarget === nativeTarget
      ) {
        return connection;
      }
    }
    const listener: EventListener = (event) => {
      if (!this.connected.has(connection)) {
        return;
      }
      if (boundary === "window") {
        this.rememberDispatch(type, event);
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        if (path.some((target) => this.activeRoots.has(target))) {
          this.windowEvents.add(event);
        } else {
          this.windowEvents.delete(event);
        }
        this.identities.set(event, {});
        return;
      }
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const innermost = path.find((target) => this.activeRoots.has(target)) ?? nativeTarget;
      const outermost = [...path].reverse().find((target) => this.activeRoots.has(target));
      const window = root.ownerDocument.defaultView;
      const disconnected = !window || !path.includes(window);
      if (
        (disconnected && (outermost ?? nativeTarget) === nativeTarget) ||
        (!this.windowEvents.has(event) && !this.rootEvents.has(event))
      ) {
        this.identities.set(event, {});
        this.rootEvents.add(event);
      }
      if (innermost === nativeTarget) {
        this.windowEvents.delete(event);
        this.rootEvents.delete(event);
      }
      this.rememberDispatch(type, event);
    };
    const connection: BrowserListenerConnection = {
      type,
      target: boundary === "window" ? "window" : "surface",
      capture: true,
      passive: true,
      nativeTarget,
      listener,
      boundary,
    };
    const reconciliation = this.reconciliation;
    nativeTarget.addEventListener(type, listener, { capture: true, passive: true });
    if (this.reconciliation !== reconciliation) {
      nativeTarget.removeEventListener(type, listener, true);
      throw SUPERSEDED_RECONCILIATION;
    }
    this.connected.add(connection);
    return connection;
  }

  /**
   * Retains a weak reference to an active native dispatch for listener reconciliation.
   *
   * @param type - Browser input name whose dispatch is active.
   * @param event - Native event currently delivered by a capture boundary.
   * @returns Completed entries are pruned and the active event is recorded once.
   */
  private rememberDispatch(type: string, event: Event): void {
    if (typeof event.eventPhase !== "number" || event.eventPhase === 0) {
      return;
    }
    const events = this.activeDispatches.get(type) ?? new Set<WeakRef<Event>>();
    for (const reference of events) {
      const current = reference.deref();
      if (!current || current.eventPhase === 0) {
        if (current) {
          this.windowEvents.delete(current);
          this.rootEvents.delete(current);
        }
        events.delete(reference);
      } else if (current === event) {
        return;
      }
    }
    events.add(new WeakRef(event));
    this.activeDispatches.set(type, events);
  }

  /**
   * Checks whether an input type still has a native dispatch in progress.
   *
   * @param type - Browser input name whose retained dispatches are inspected.
   * @returns True while a recorded event is still propagating.
   */
  private hasActiveDispatch(type: string): boolean {
    const events = this.activeDispatches.get(type);
    if (!events) {
      return false;
    }
    for (const reference of events) {
      const event = reference.deref();
      if (!event || event.eventPhase === 0) {
        if (event) {
          this.windowEvents.delete(event);
          this.rootEvents.delete(event);
        }
        events.delete(reference);
      }
    }
    if (events.size === 0) {
      this.activeDispatches.delete(type);
    }
    return events.size > 0;
  }

  /**
   * Checks whether a native target still has a current borrowed occurrence.
   *
   * Reconciliation can occur during an owner check; in that case the previous
   * target list cannot authorize this delivery.
   *
   * @param target - Surface, document, or window receiving this listener.
   * @returns True when an attached occurrence still owns the target in the unchanged list.
   * @throws Propagates occurrence ownership failures.
   */
  private hasAttachedRoot(target: EventTarget): boolean {
    const roots = this.activeTargets.get(target);
    if (!roots) {
      return false;
    }
    for (const root of roots) {
      if (!root.isAttached()) {
        continue;
      }
      const element = getBrowserInputRootElement(root);
      const currentTarget =
        element &&
        (target === element ||
          target === element.ownerDocument ||
          target === element.ownerDocument.defaultView);
      if (currentTarget && this.activeTargets.get(target) === roots) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the opaque identity shared by the current event's listener groups.
   *
   * @param event - Native input observed by this listener.
   * @returns A tracked dispatch identity, or a new identity when tracking is disabled.
   */
  private getDispatchIdentity(event: Event): object {
    let identity = this.trackDispatch ? this.identities.get(event) : undefined;
    if (!identity) {
      identity = {};
      if (this.trackDispatch) {
        this.identities.set(event, identity);
      }
    }
    return identity;
  }
}
