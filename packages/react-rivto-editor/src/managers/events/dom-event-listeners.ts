import type { DOMEventTarget } from "./dom-types";

/** Native listener options that must match before registrations can share a listener. */
export interface NativeListenerGroup {
  readonly target: DOMEventTarget;
  readonly type: string;
  readonly capture: boolean;
  readonly passive: boolean;
}

interface ConnectedListener extends NativeListenerGroup {
  readonly nativeTarget: EventTarget;
  readonly listener: EventListener;
}

/**
 * Attaches and removes native browser listeners for the document's editor views.
 *
 * Registrations with the same event type, target, capture, and passive options
 * share one listener per DOM target. Views in the same document or window also
 * share those targets. EventManager decides which handlers receive each event;
 * this class only forwards it with its listener options and optional surface root.
 */
export class DOMEventListeners {
  private readonly connected: ConnectedListener[] = [];
  /** @param dispatch - Receives native events with their group and optional surface root. */
  constructor(private readonly dispatch: (group: NativeListenerGroup, raw: Event, root?: HTMLElement) => void) {}
  /**
   * Replaces all native listeners using the current registrations and view roots.
   *
   * Focus and pointer lifecycle listeners are included even without extension
   * registrations, so view activation and gesture cleanup still work. An empty root
   * set removes all listeners; roots without a window skip window registrations.
   * @param registrations - Event types, targets, and listener options to group.
   * @param roots - Registered editor surfaces whose documents and windows receive listeners.
   */
  connect(registrations: readonly NativeListenerGroup[], roots: ReadonlySet<HTMLElement>): void {
    this.disconnect();
    if (!roots.size) return;
    const groups = new Map<string, NativeListenerGroup>();
    for (const registration of registrations) {
      const group: NativeListenerGroup = registration;
      const key = [group.target, group.type, group.capture, group.passive].join(":");
      if (!groups.has(key)) groups.set(key, group);
    }
    if (roots.size > 0) {
      // Activation and gesture lifetime belong to views even without interaction extensions.
      const lifecycle: NativeListenerGroup[] = [
        { target: "surface", type: "focusin", capture: false, passive: false },
        { target: "surface", type: "pointerdown", capture: false, passive: false },
        { target: "window", type: "pointerup", capture: false, passive: false },
        { target: "window", type: "pointercancel", capture: false, passive: false },
      ];
      lifecycle.forEach((group) => groups.set([group.target, group.type, group.capture, group.passive].join(":"), group));
    }
    for (const group of groups.values()) {
      const targets = new Set<EventTarget>();
      for (const root of roots) {
        let nativeTarget: EventTarget | null = root;
        if (group.target === "document") nativeTarget = root.ownerDocument;
        else if (group.target === "window") nativeTarget = root.ownerDocument.defaultView;
        if (!nativeTarget || targets.has(nativeTarget)) continue;
        targets.add(nativeTarget);
        const listener: EventListener = (event) => this.dispatch(group, event, group.target === "surface" ? root : undefined);
        nativeTarget.addEventListener(group.type, listener, { capture: group.capture, passive: group.passive });
        this.connected.push({ ...group, nativeTarget, listener });
      }
    }
  }

  /** Removes every native listener, including listeners shared by window/document roots. */
  disconnect(): void {
    for (const { nativeTarget, type, listener, capture } of this.connected) {
      nativeTarget.removeEventListener(type, listener, capture);
    }
    this.connected.length = 0;
  }

}
