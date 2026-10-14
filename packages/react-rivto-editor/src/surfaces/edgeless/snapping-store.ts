import type { EdgelessSnappingSnapshot } from "./types";

/** Observable snapping settings whose persistence is owned by the host. */
export class EdgelessSnappingStore {
  private value: EdgelessSnappingSnapshot;
  private readonly listeners = new Set<() => void>();

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

  /** @returns Stable current settings for external-store consumers. */
  getSnapshot(): EdgelessSnappingSnapshot {
    return this.value;
  }

  /** Subscribes to effective setting changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Applies a partial setting update and notifies subscribers once. */
  set(patch: Partial<EdgelessSnappingSnapshot>): void {
    const next = { ...this.value, ...patch };
    if (
      next.snapToGrid === this.value.snapToGrid &&
      next.alignObjects === this.value.alignObjects
    ) {
      return;
    }
    this.value = next;
    [...this.listeners].forEach((listener) => listener());
  }
}
