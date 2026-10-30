import type { ConnectedListener, NativeListenerGroup } from "./types";

/**
 * Attaches and removes native browser listeners for the document's editor panels.
 *
 * Registrations with the same event type, target, capture, and passive options
 * share one listener per DOM target. Panels in the same document or window also
 * share those targets. EventManager decides which handlers receive each event;
 * this class only forwards it with its listener options and optional surface root.
 */
export class DOMEventListeners {
  private readonly connected = new Set<ConnectedListener>();
  /** @param dispatch - Receives native events with their group and optional surface root. */
  constructor(
    private readonly dispatch: (group: NativeListenerGroup, raw: Event, root?: HTMLElement) => void,
  ) {}
  /**
   * Reconciles native listeners with the current registrations and panel roots.
   *
   * Focus and pointer lifecycle listeners are included even without extension
   * registrations, so panel activation and gesture cleanup still work. An empty root
   * set removes all listeners; roots without a window skip window registrations.
   * Unchanged listeners retain their identity so registration changes inside a
   * callback do not suppress pending delivery in other native groups. Failed
   * attachment removes only newly added connections, preserving prior listeners;
   * rollback errors are retained alongside the original installation failure.
   *
   * @param registrations - Event types, targets, and listener options to group.
   * @param roots - Registered editor surfaces whose documents and windows receive listeners.
   * @returns Required listeners are attached and obsolete connections are removed.
   * @throws Native installation failures, or AggregateError retaining rollback or removal failures.
   */
  connect(registrations: readonly NativeListenerGroup[], roots: ReadonlySet<HTMLElement>): void {
    if (!roots.size) {
      this.disconnect();
      return;
    }
    const previous = new Set(this.connected);
    let used: Set<ConnectedListener>;
    try {
      used = this.connectGroups(registrations, roots);
    } catch (error) {
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
    registrations: readonly NativeListenerGroup[],
    roots: ReadonlySet<HTMLElement>,
  ): Set<ConnectedListener> {
    const used = new Set<ConnectedListener>();
    for (const group of this.getGroups(registrations)) {
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
    return used;
  }

  /**
   * Disables and removes each supplied native connection without stopping at errors.
   *
   * @param connections - Exact connections being disconnected or rolled back.
   * @returns Native removal failures in attempted cleanup order.
   */
  private releaseConnections(connections: Iterable<ConnectedListener>): unknown[] {
    const errors: unknown[] = [];
    for (const connection of [...connections]) {
      this.connected.delete(connection);
      const { nativeTarget, type, listener, capture } = connection;
      try {
        nativeTarget.removeEventListener(type, listener, capture);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  /**
   * Groups registration options and retains the panel activation listeners.
   *
   * Descriptors contain native options only, so a retained listener does not keep
   * a removed registration's callback or extension alive.
   *
   * @param registrations - Current event names, targets and native listener options.
   * @returns One descriptor per native group, including panel lifecycle events.
   */
  private getGroups(registrations: readonly NativeListenerGroup[]): NativeListenerGroup[] {
    const groups = new Map<string, NativeListenerGroup>();
    const lifecycle: NativeListenerGroup[] = [
      { target: "surface", type: "focusin", capture: false, passive: false },
      { target: "surface", type: "pointerdown", capture: false, passive: false },
      { target: "window", type: "pointerup", capture: false, passive: false },
      { target: "window", type: "pointercancel", capture: false, passive: false },
    ];
    // Activation and gesture lifetime belong to panels even without interaction extensions.
    for (const { target, type, capture, passive } of [...registrations, ...lifecycle]) {
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
    group: NativeListenerGroup,
    nativeTarget: EventTarget,
    root: HTMLElement,
  ): ConnectedListener {
    for (const connection of this.connected) {
      if (
        connection.nativeTarget === nativeTarget &&
        connection.target === group.target &&
        connection.type === group.type &&
        connection.capture === group.capture &&
        connection.passive === group.passive
      ) {
        return connection;
      }
    }
    const attachedRoot = group.target === "surface" ? root : undefined;
    const listener: EventListener = (event) => {
      if (this.connected.has(connection)) {
        this.dispatch(group, event, attachedRoot);
      }
    };
    const connection = { ...group, nativeTarget, listener };
    nativeTarget.addEventListener(group.type, listener, {
      capture: group.capture,
      passive: group.passive,
    });
    this.connected.add(connection);
    return connection;
  }
}
