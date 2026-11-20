import type { PointerBoundaryLease, SharedPointerBoundary } from "./types";
import { beginPointerDispatch } from "./pointer-ownership";

/** Shared native boundaries keyed by their exact window or occurrence. */
const boundaries = new WeakMap<EventTarget, Map<string, SharedPointerBoundary>>();
/** Retained occurrence boundaries used to identify the outermost disconnected root. */
const roots = new WeakMap<EventTarget, Map<string, number>>();
/** Window boundary that has already started an event's current delivery. */
const windowDeliveries = new WeakMap<Event, SharedPointerBoundary>();

/**
 * Retains one shared capture boundary for a pointer event and browser target.
 *
 * A connected event starts at the window. A disconnected event starts at the
 * outermost retained occurrence in its propagation path. Multiple listener owners
 * share the native boundary, so an intervening handler cannot reset the snapshot.
 *
 * @param target - Window, disconnected tree, or mounted occurrence receiving capture.
 * @param type - Pointer continuation event name.
 * @param root - Occurrence owning a tree or root target; omitted for a window.
 * @returns Shared listener and idempotent disposer for this owner's reference.
 * @throws Propagates native listener installation or removal failures.
 */
export function retainPointerDispatchBoundary(
  target: EventTarget,
  type: string,
  root?: HTMLElement,
): PointerBoundaryLease {
  const key = `${root ? "root" : "window"}:${type}`;
  const document = root?.ownerDocument;
  const entries = boundaries.get(target) ?? new Map<string, SharedPointerBoundary>();
  let boundary = entries.get(key);
  if (boundary && boundary.count === 0 && !hasActiveDispatch(boundary)) {
    entries.delete(key);
    boundary = undefined;
  }
  if (!boundary) {
    boundary = createPointerBoundary(target, type, document);
    entries.set(key, boundary);
    boundaries.set(target, entries);
  }
  if (!boundary.attached) {
    target.addEventListener(type, boundary.listener, { capture: true, passive: true });
    boundary.attached = true;
  }
  boundary.count += 1;
  if (root) {
    const counts = roots.get(target) ?? new Map<string, number>();
    counts.set(type, (counts.get(type) ?? 0) + 1);
    roots.set(target, counts);
  }
  let active = true;
  /**
   * Releases this owner's shared boundary reference once.
   *
   * @returns The native listener is removed when the final owner releases it.
   * @throws Propagates native listener removal failures.
   */
  const release = () => {
    if (!active) {
      return;
    }
    active = false;
    releasePointerBoundary(target, type, key, Boolean(root), entries, boundary);
  };
  return { listener: boundary.listener, release };
}

/**
 * Creates the shared listener that starts pointer-owner snapshots.
 *
 * @param target - Window or occurrence tree receiving capture.
 * @param type - Pointer continuation event name.
 * @param document - Occurrence document, omitted for a window boundary.
 * @returns Unattached boundary ready to be retained by listener owners.
 */
function createPointerBoundary(
  target: EventTarget,
  type: string,
  document?: Document,
): SharedPointerBoundary {
  const boundary: SharedPointerBoundary = {
    count: 0,
    attached: false,
    activeEvents: new Set(),
    /**
     * Starts a snapshot when this is the first active boundary in the dispatch.
     *
     * @param event - Native pointer continuation being delivered.
     * @returns The current gesture snapshot is reset when this boundary starts delivery.
     */
    listener(event) {
      if (boundary.count === 0) {
        return;
      }
      rememberDispatch(boundary, event);
      if (!document) {
        windowDeliveries.set(event, boundary);
        beginPointerDispatch(event);
      } else if (isFirstRootBoundary(event, target, document, type)) {
        beginPointerDispatch(event);
      }
    },
  };
  return boundary;
}

/**
 * Releases one shared boundary and its occurrence reference.
 *
 * An in-flight identity remains available for a replacement owner, but the
 * native listener is removed immediately when the final owner releases it.
 *
 * @param target - Browser target owning the native listener.
 * @param type - Pointer continuation event name.
 * @param key - Boundary key within the target's retained entries.
 * @param root - Whether the boundary represents an occurrence tree.
 * @param entries - Retained boundaries for the target.
 * @param boundary - Exact shared boundary to release.
 * @returns This reference is released and the final native removal is attempted.
 * @throws Propagates native listener removal failures.
 */
function releasePointerBoundary(
  target: EventTarget,
  type: string,
  key: string,
  root: boolean,
  entries: Map<string, SharedPointerBoundary>,
  boundary: SharedPointerBoundary,
): void {
  if (root) {
    const counts = roots.get(target);
    const count = counts?.get(type) ?? 0;
    if (count <= 1) {
      counts?.delete(type);
    } else {
      counts?.set(type, count - 1);
    }
  }
  boundary.count -= 1;
  if (boundary.count === 0) {
    boundary.attached = false;
    if (!hasActiveDispatch(boundary) && entries.get(key) === boundary) {
      entries.delete(key);
    }
    target.removeEventListener(type, boundary.listener, true);
  }
}

/**
 * Finds the first retained occurrence when window capture did not start delivery.
 *
 * Connected events normally cross the shared window boundary first. A boundary
 * installed during an already-running dispatch instead starts at the first root.
 *
 * @param event - Pointer event currently propagating.
 * @param target - Tree or occurrence boundary receiving capture.
 * @param document - Browser document owning the occurrence.
 * @param type - Pointer continuation event name.
 * @returns Whether this occurrence starts the delivery.
 */
function isFirstRootBoundary(
  event: Event,
  target: EventTarget,
  document: Document,
  type: string,
): boolean {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const window = document.defaultView;
  const windowBoundary = window && boundaries.get(window)?.get(`window:${type}`);
  if (
    window &&
    windowBoundary &&
    path.includes(window) &&
    windowBoundary === windowDeliveries.get(event)
  ) {
    return false;
  }
  const outermost = [...path].reverse().find((entry) => (roots.get(entry)?.get(type) ?? 0) > 0);
  if ((outermost ?? target) !== target) {
    return false;
  }
  if (windowBoundary) {
    rememberDispatch(windowBoundary, event);
    windowDeliveries.set(event, windowBoundary);
  }
  return true;
}

/**
 * Records an in-flight event without retaining the event after collection.
 *
 * @param boundary - Shared identity boundary receiving the event.
 * @param event - Native event whose dispatch is in progress.
 * @returns Completed references are pruned and the current event is recorded once.
 */
function rememberDispatch(boundary: SharedPointerBoundary, event: Event): void {
  if (!event.eventPhase) {
    return;
  }
  for (const reference of boundary.activeEvents) {
    const current = reference.deref();
    if (!current || !current.eventPhase) {
      boundary.activeEvents.delete(reference);
    } else if (current === event) {
      return;
    }
  }
  boundary.activeEvents.add(new WeakRef(event));
}

/**
 * Checks whether a boundary has a native delivery still propagating.
 *
 * @param boundary - Boundary whose weak event references are inspected.
 * @returns Whether at least one recorded event remains in dispatch.
 */
function hasActiveDispatch(boundary: SharedPointerBoundary): boolean {
  let active = false;
  for (const reference of boundary.activeEvents) {
    const event = reference.deref();
    if (!event || !event.eventPhase) {
      boundary.activeEvents.delete(reference);
    } else {
      active = true;
    }
  }
  return active;
}
