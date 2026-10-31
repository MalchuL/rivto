import { Listeners } from "@chulane/rivto-utils";

import type { EdgelessSnappingSnapshot } from "./types";

/** Observable snapping settings whose persistence is owned by the host. */
export class EdgelessSnappingStore {
  private value: EdgelessSnappingSnapshot;
  private readonly listeners = new Listeners<{ changed: void }>();

  /**
   * Initializes snapping preferences, defaulting grid snapping and object alignment to enabled.
   *
   * @param initial - Initial grid-snapping and object-alignment flags; missing flags default to true.
   */
  constructor(initial: Partial<EdgelessSnappingSnapshot> = {}) {
    this.value = {
      snapToGrid: initial.snapToGrid ?? true,
      alignObjects: initial.alignObjects ?? true,
    };
  }

  /**
   * Reads the current snapping preferences without copying the snapshot.
   *
   * @returns Stable current settings for external-store consumers, replaced only
   * when a preference changes.
   */
  getSnapshot(): EdgelessSnappingSnapshot {
    return this.value;
  }

  /**
   * Subscribes to effective setting changes.
   *
   * @param listener - Callback invoked synchronously after a changed snapshot is stored.
   * @returns Disposer removing this listener from subsequent notifications.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("changed", listener);
  }

  /**
   * Applies a partial setting update and notifies subscribers once.
   *
   * Unchanged preferences preserve snapshot identity and do not notify listeners.
   * Persistence remains the host's responsibility.
   *
   * @param patch - Preferences to replace; omitted fields retain their current values.
   * @returns Effective changes are stored and subscribed listeners are notified.
   * @throws Propagates listener failures after storing the new snapshot.
   */
  set(patch: Partial<EdgelessSnappingSnapshot>): void {
    const next = { ...this.value, ...patch };
    if (
      next.snapToGrid === this.value.snapToGrid &&
      next.alignObjects === this.value.alignObjects
    ) {
      return;
    }
    this.value = next;
    this.listeners.emit("changed");
  }
}
