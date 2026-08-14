/** Host-configurable edgeless snapping preferences. */
export interface EdgelessSnappingSnapshot {
  readonly snapToGrid: boolean;
  readonly alignObjects: boolean;
}

/** Options accepted by the built-in edgeless surface extension. */
export interface EdgelessSurfaceOptions {
  /** Shared settings store; a private default store is created when omitted. */
  readonly snapping?: EdgelessSnappingStore;
  /** Places newly created block cards away from existing block cards. */
  readonly avoidBlockElementOverlap?: boolean;
  /** Width of newly created block cards in canvas units; defaults to the 720px page width. */
  readonly blockElementWidth?: number;
}

/** Observable snapping settings whose persistence is owned by the host. */
export class EdgelessSnappingStore {
  private value: EdgelessSnappingSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(initial: Partial<EdgelessSnappingSnapshot> = {}) {
    this.value = {
      snapToGrid: initial.snapToGrid ?? true,
      alignObjects: initial.alignObjects ?? true,
    };
  }

  /** @returns Stable current settings for external-store consumers. */
  getSnapshot(): EdgelessSnappingSnapshot { return this.value; }

  /** Subscribes to effective setting changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Applies a partial setting update and notifies subscribers once. */
  set(patch: Partial<EdgelessSnappingSnapshot>): void {
    const next = { ...this.value, ...patch };
    if (next.snapToGrid === this.value.snapToGrid && next.alignObjects === this.value.alignObjects) return;
    this.value = next;
    [...this.listeners].forEach((listener) => listener());
  }
}
