import type {
  BrowserInputDefinition,
  BrowserInputMap,
  BrowserListenerRoot,
} from "../../events/types";
import type {
  BrowserInputAttachment,
  BrowserInputBoundary,
  BrowserInputListenersOptions,
} from "./types";
import { NativeEventListeners } from "./native-event-listeners";
import { getBrowserInputRootElement } from "./browser-input-root-elements";

/** Owns browser input attachment and delivers normalized input to one occurrence. */
export class BrowserInputListeners {
  private static readonly roots = new WeakMap<EventTarget, Set<BrowserInputAttachment>>();
  private readonly listeners = new NativeEventListeners();
  private readonly ownsRoot: boolean;
  private readonly trackDispatch: boolean;
  private readonly boundaries = new Map<string, BrowserInputBoundary>();
  private readonly dispatches = new WeakMap<Event, object>();
  private attachment: BrowserInputAttachment | undefined;

  /**
   * Creates an occurrence owner or a listener borrowing another owner's root.
   *
   * @param options - Root-boundary ownership and optional dispatch identity tracking.
   * @param options.ownsRoot - Whether this listener owns an occurrence boundary; defaults to true.
   * @param options.trackDispatch - Whether callbacks receive dispatch identities; defaults to false.
   */
  constructor(options: BrowserInputListenersOptions = {}) {
    this.ownsRoot = options.ownsRoot ?? true;
    this.trackDispatch = options.trackDispatch ?? false;
  }

  /**
   * Retains a normalized input callback across detach and later attachment.
   *
   * Owning root listeners exclude input belonging to a nested attached occurrence
   * unless the registration explicitly includes nested input.
   * Borrowing observers receive root events and apply their own scope rules.
   * Document and window listeners still receive global input from the same realm.
   *
   * @param definition - Input name, listener target, capture phase, and optional passive mode.
   * @param deliver - Callback receiving copied data and synchronous capabilities.
   * When dispatch tracking is enabled, its second argument is an opaque identity
   * shared across listener groups for one native dispatch; otherwise it is omitted.
   * @returns Idempotent disposer releasing this callback and its listener.
   * @throws If native listener installation fails.
   */
  register<K extends keyof BrowserInputMap>(
    definition: BrowserInputDefinition<K>,
    deliver: (input: BrowserInputMap[K], dispatchIdentity?: object) => void,
  ): () => void {
    const retained = { ...definition };
    const releaseBoundary = this.trackDispatch ? this.retainBoundary(retained.type) : undefined;
    let releaseInput: () => void;
    try {
      releaseInput = this.listeners.register(retained, (event, root, input) => {
        const attachment = this.attachment;
        if (this.ownsRoot && retained.target === "root" && !retained.includeNested) {
          const path = event.composedPath();
          const owner = path.find((target) => BrowserInputListeners.hasActiveRoot(target));
          // A directly invoked listener has no propagation path to filter.
          if (path.length > 0 && owner !== root) {
            return;
          }
        }
        if (!attachment || this.attachment !== attachment) {
          return;
        }
        const active = !attachment.occurrence || attachment.occurrence.isAttached();
        // Ownership checks may synchronously replace this listener's attachment.
        if (!active || this.attachment !== attachment) {
          return;
        }
        // The listener was installed for this exact event-map name.
        if (this.trackDispatch) {
          deliver(input as BrowserInputMap[K], this.dispatches.get(event));
        } else {
          deliver(input as BrowserInputMap[K]);
        }
      });
    } catch (error) {
      try {
        releaseBoundary?.();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Input registration rollback failed");
      }
      throw error;
    }
    return () => {
      const errors: unknown[] = [];
      for (const release of [releaseInput, releaseBoundary]) {
        try {
          release?.();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, "Input registration cleanup failed");
      }
    };
  }

  /**
   * Installs retained input listeners for one occurrence and its browser realm.
   *
   * Registrations survive detach. An old disposer cannot detach a later mount,
   * and a failed attachment releases ownership even when rollback also fails.
   * A borrowed Root bounds delivery and any captured attachment-bound capability.
   * Detaching it withdraws its nested-input boundary even before listener cleanup.
   *
   * @param root - Mounting element or attached browser Root borrowed from its owner.
   * @returns Idempotent disposer detaching only this attachment.
   * Several owners may attach to the same physical occurrence root; it remains
   * a nested-input boundary until the last owning attachment is released. Borrowing
   * observers neither create nor remove that boundary.
   *
   * @throws If this listener is already attached, a Root is detached or unsupported,
   * or browser listener setup fails; AggregateError retains a rollback failure.
   */
  attach(root: HTMLElement | BrowserListenerRoot): () => void {
    if (this.attachment) {
      throw new Error("Browser input requires an unattached root");
    }
    let occurrence: BrowserListenerRoot | undefined;
    let element: HTMLElement | undefined;
    if ("isAttached" in root) {
      occurrence = root;
      element = getBrowserInputRootElement(root);
    } else {
      element = root;
    }
    if (!element || (occurrence && !occurrence.isAttached())) {
      throw new Error("Browser input requires an active browser root");
    }
    const attachment: BrowserInputAttachment = { element, occurrence };
    this.attachment = attachment;
    if (this.ownsRoot) {
      const owners = BrowserInputListeners.roots.get(element) ?? new Set();
      owners.add(attachment);
      BrowserInputListeners.roots.set(element, owners);
    }
    let detach: (() => void) | undefined;
    try {
      detach = this.listeners.attach(
        element,
        occurrence ? () => occurrence.isAttached() : undefined,
      );
      if (occurrence && !occurrence.isAttached()) {
        throw new Error("Browser input root detached during attachment");
      }
    } catch (error) {
      this.attachment = undefined;
      if (this.ownsRoot) {
        this.releaseRoot(attachment);
      }
      try {
        detach?.();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Browser input attachment rollback failed");
      }
      throw error;
    }
    let active = true;
    return () => {
      if (active) {
        active = false;
        this.attachment = undefined;
        if (this.ownsRoot) {
          this.releaseRoot(attachment);
        }
        detach();
      }
    };
  }

  /**
   * Releases one attachment without withdrawing a root still used by another listener.
   *
   * @param attachment - Exact listener attachment whose ownership is ending.
   * @returns The root remains a nested boundary until its final owner detaches.
   */
  private releaseRoot(attachment: BrowserInputAttachment): void {
    const owners = BrowserInputListeners.roots.get(attachment.element);
    owners?.delete(attachment);
    if (owners?.size === 0) {
      BrowserInputListeners.roots.delete(attachment.element);
    }
  }

  /**
   * Retains capture listeners that identify each actual native dispatch.
   *
   * Window capture covers connected occurrences and global input. Root capture
   * covers events dispatched within a disconnected occurrence.
   *
   * @param type - Native event name requiring dispatch identity.
   * @returns Idempotent disposer releasing boundaries after the last registration.
   * @throws If boundary installation or cleanup fails.
   */
  private retainBoundary(type: string): () => void {
    let boundary = this.boundaries.get(type);
    if (!boundary || boundary.count === 0) {
      if (boundary && !this.hasActiveDispatch(boundary)) {
        boundary = undefined;
      }
      boundary = this.createBoundary(type, boundary);
      this.boundaries.set(type, boundary);
    }
    boundary.count += 1;
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      boundary.count -= 1;
      if (boundary.count === 0) {
        const errors = this.releaseBoundaryListeners(boundary.releases);
        boundary.releases = [];
        if (this.hasActiveDispatch(boundary)) {
          // Microtasks may run between native listeners in the same dispatch.
          setTimeout(() => {
            if (boundary.count === 0 && this.boundaries.get(type) === boundary) {
              this.boundaries.delete(type);
            }
          }, 0);
        } else {
          this.boundaries.delete(type);
        }
        if (errors.length) {
          throw new AggregateError(errors, "Input boundary cleanup failed");
        }
      }
    };
  }

  /**
   * Installs window and root capture boundaries for one native event name.
   *
   * A root boundary supplies the identity when the window is outside the path
   * or when registration happened after window capture had already passed.
   *
   * @param type - Native event name to identify.
   * @param existing - Dormant boundary preserving an in-flight identity, if any.
   * @returns Boundary with no consumers and both listener disposers.
   * @throws If installation fails; AggregateError retains failed rollback cleanup.
   */
  private createBoundary(type: string, existing?: BrowserInputBoundary): BrowserInputBoundary {
    const releases: Array<() => void> = [];
    const boundary = existing ?? {
      count: 0,
      releases: [],
      windowDispatches: new WeakSet<Event>(),
      activeEvents: new Set<WeakRef<Event>>(),
    };
    try {
      releases.push(
        this.listeners.register({ type, target: "window", capture: true }, (event) => {
          this.dispatches.set(event, {});
          boundary.windowDispatches.add(event);
          this.trackDispatchEvent(boundary, event);
        }),
      );
      releases.push(
        this.listeners.register({ type, target: "root", capture: true }, (event, root) => {
          const outer = root.ownerDocument.defaultView ?? root.ownerDocument;
          if (!event.composedPath().includes(outer) || !boundary.windowDispatches.has(event)) {
            this.dispatches.set(event, {});
          }
          boundary.windowDispatches.delete(event);
          this.trackDispatchEvent(boundary, event);
        }),
      );
    } catch (error) {
      const errors = this.releaseBoundaryListeners(releases);
      if (errors.length) {
        throw new AggregateError([error, ...errors], "Input boundary rollback failed");
      }
      throw error;
    }
    boundary.releases = releases;
    return boundary;
  }

  /**
   * Remembers a currently dispatching event without retaining it after collection.
   *
   * @param boundary - Boundary whose native dispatches are being tracked.
   * @param event - Event currently delivered by a capture boundary.
   * @returns Completed references are pruned and this event is retained weakly once.
   */
  private trackDispatchEvent(boundary: BrowserInputBoundary, event: Event): void {
    let tracked = false;
    for (const reference of boundary.activeEvents) {
      const current = reference.deref();
      if (!current || current.eventPhase === 0) {
        boundary.activeEvents.delete(reference);
      } else if (current === event) {
        tracked = true;
      }
    }
    if (!tracked) {
      boundary.activeEvents.add(new WeakRef(event));
    }
  }

  /**
   * Checks whether a boundary still has a native dispatch in progress.
   *
   * @param boundary - Boundary whose event references may contain completed deliveries.
   * @returns True while any referenced event is propagating.
   */
  private hasActiveDispatch(boundary: BrowserInputBoundary): boolean {
    let active = false;
    for (const reference of boundary.activeEvents) {
      const event = reference.deref();
      if (!event || event.eventPhase === 0) {
        boundary.activeEvents.delete(reference);
      } else {
        active = true;
      }
    }
    return active;
  }

  /**
   * Attempts every retained boundary cleanup without stopping at a failure.
   *
   * @param releases - Listener disposers to invoke.
   * @returns Cleanup failures in invocation order.
   */
  private releaseBoundaryListeners(releases: readonly (() => void)[]): unknown[] {
    const errors: unknown[] = [];
    for (const release of releases) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  /**
   * Checks whether any owning attachment still claims a native input boundary.
   *
   * @param target - Native event-path target to inspect.
   * @returns True while at least one owner remains active.
   * @throws Propagates borrowed Root ownership check failures.
   */
  private static hasActiveRoot(target: EventTarget): boolean {
    const owners = BrowserInputListeners.roots.get(target);
    if (!owners) {
      return false;
    }
    if (owners.size === 1) {
      const owner = owners.values().next().value;
      if (!owner) {
        return false;
      }
      const active = !owner.occurrence || owner.occurrence.isAttached();
      return active && owners.has(owner);
    }
    // Ownership checks can register another occurrence during this delivery.
    for (const owner of [...owners]) {
      if (!owners.has(owner)) {
        continue;
      }
      const active = !owner.occurrence || owner.occurrence.isAttached();
      if (active && owners.has(owner)) {
        return true;
      }
    }
    return false;
  }
}
