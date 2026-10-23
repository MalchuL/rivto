/** Native events available to canvas extensions, including window blur. */
export type CanvasEventMap = HTMLElementEventMap & WindowEventMap;

/** Native listener placement; global listeners belong to the attached root's realm. */
export type CanvasEventTarget = "root" | "document" | "window";

/** Typed registration retained across viewport detach and remount. */
export interface CanvasEventRegistration<K extends keyof CanvasEventMap> {
  readonly id: string;
  readonly type: K;
  readonly target?: CanvasEventTarget;
  readonly capture?: boolean;
  /** Higher priorities run first within the same native target and phase; defaults to zero. */
  readonly priority?: number;
  /**
   * Receives native input for the attached viewport.
   *
   * Default prevention and native propagation remain explicit callback operations.
   * Return handled to skip later registered handlers in this native listener group.
   *
   * @param event - Original typed browser event.
   * @returns Handled when subsequent handlers in the group must not run.
   */
  readonly handle: (event: CanvasEventMap[K]) => "handled" | void;
}

/** Type-erased callback retained with its native event-name invariant. */
interface CanvasEventEntry {
  readonly id: string;
  readonly priority: number;
  active: boolean;
  /**
   * Delivers one event from the entry's exact native listener group.
   *
   * @param event - Native event with the registered event name.
   * @returns Whether later handlers in the group should be skipped.
   */
  invoke(event: Event): "handled" | void;
}

/** Registrations sharing a single native listener and dispatch order. */
interface CanvasEventGroup {
  readonly type: string;
  readonly target: CanvasEventTarget;
  readonly capture: boolean;
  readonly entries: CanvasEventEntry[];
  release?: () => void;
}

/** Owns typed canvas input registrations separately from the mounted DOM lifetime. */
export class CanvasEvents {
  private static readonly roots = new WeakSet<EventTarget>();
  private readonly groups = new Map<string, CanvasEventGroup>();
  private readonly ids = new Set<string>();
  private root?: HTMLElement;

  /**
   * Registers input before or after viewport attachment without changing document state.
   *
   * Registrations survive detach; their owners must call the returned disposer.
   * Root handlers exclude nested attached canvas roots; global handlers must admit
   * only their own active gestures. Equal priorities retain registration order. Adding during dispatch takes effect
   * on the next event; removing during dispatch prevents subsequent delivery.
   *
   * @param registration - Unique identity, native placement and typed callback.
   * @returns Idempotent disposer removing only this registration and unused listeners.
   * @throws If the ID is blank or duplicated, priority is not finite, or listener setup fails.
   */
  register<K extends keyof CanvasEventMap>(registration: CanvasEventRegistration<K>): () => void {
    const { id, type, target = "root", capture = false, priority = 0, handle } = registration;
    if (!id.trim() || this.ids.has(id) || !Number.isFinite(priority)) {
      throw new Error("Canvas events require a unique ID and finite priority");
    }
    const key = JSON.stringify([type, target, capture]);
    const group = this.groups.get(key) ?? { type, target, capture, entries: [] };
    const entry: CanvasEventEntry = {
      id,
      priority,
      active: true,
      /**
       * Restores the typed event guaranteed by the native listener's name.
       *
       * @param event - Event delivered by the matching listener group.
       * @returns The callback's dispatch decision.
       */
      invoke(event) {
        return handle(event as CanvasEventMap[K]);
      },
    };
    this.groups.set(key, group);
    group.entries.push(entry);
    group.entries.sort((a, b) => b.priority - a.priority);
    this.ids.add(id);
    try {
      this.connect(group);
    } catch (error) {
      this.remove(key, group, entry);
      throw error;
    }
    return () => this.remove(key, group, entry);
  }

  /**
   * Attaches all registered inputs to one root and its document/window.
   *
   * @param root - Viewport receiving root listeners and defining the global event realm.
   * @returns Idempotent detach retaining registrations for a later attachment.
   * @throws If already attached, the document has no window, or native setup fails.
   */
  attach(root: HTMLElement): () => void {
    if (this.root || CanvasEvents.roots.has(root) || !root.ownerDocument.defaultView) {
      throw new Error("Canvas events require an unattached root with a window");
    }
    this.root = root;
    CanvasEvents.roots.add(root);
    try {
      for (const group of this.groups.values()) {
        this.connect(group);
      }
    } catch (error) {
      this.detach();
      throw error;
    }
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.detach();
      }
    };
  }

  /**
   * Installs one non-passive listener for the group's registrations when attached.
   *
   * @param group - Exact native event target, name and phase.
   * @returns A mounted group has one listener; detached groups retain only registrations.
   */
  private connect(group: CanvasEventGroup): void {
    if (!this.root || group.release) {
      return;
    }
    let target: EventTarget = this.root;
    if (group.target === "document") {
      target = this.root.ownerDocument;
    } else if (group.target === "window") {
      target = this.root.ownerDocument.defaultView!;
    }
    const listener = (event: Event) => this.dispatch(group, event);
    target.addEventListener(group.type, listener, { capture: group.capture, passive: false });
    group.release = () => target.removeEventListener(group.type, listener, group.capture);
  }

  /**
   * Delivers a stable registration snapshot in descending priority order.
   *
   * @param group - Listener group receiving this native event.
   * @param event - Original browser input; native flags remain callback-owned.
   * @returns Eligible callbacks have run until one claims the group delivery.
   * @throws Propagates callback failures without invoking later callbacks.
   */
  private dispatch(group: CanvasEventGroup, event: Event): void {
    if (group.target === "root") {
      const owner = event.composedPath().find((target) => CanvasEvents.roots.has(target));
      if (owner !== this.root) {
        return;
      }
    }
    for (const entry of [...group.entries]) {
      if (entry.active && entry.invoke(event) === "handled") {
        return;
      }
    }
  }

  /**
   * Removes a registration while preserving later registrations reusing its ID.
   *
   * @param key - Native group key.
   * @param group - Group owning this exact entry.
   * @param entry - Registration to remove once.
   * @returns Empty native groups and their listeners are released.
   */
  private remove(key: string, group: CanvasEventGroup, entry: CanvasEventEntry): void {
    if (!entry.active) {
      return;
    }
    entry.active = false;
    this.ids.delete(entry.id);
    group.entries.splice(group.entries.indexOf(entry), 1);
    if (!group.entries.length) {
      group.release?.();
      this.groups.delete(key);
    }
  }

  /**
   * Releases every native listener without discarding extension registrations.
   *
   * @returns No root or global listeners remain attached.
   */
  private detach(): void {
    if (this.root) {
      CanvasEvents.roots.delete(this.root);
    }
    this.root = undefined;
    for (const group of this.groups.values()) {
      group.release?.();
      group.release = undefined;
    }
  }
}
