import type { EdgelessSnappingStore } from "./snapping-store";
/**
 * Host-owned snapping preferences for the optional edgeless surface.
 *
 * The store remains outside persisted document state and exposes the stable
 * subscription contract consumed by React's external-store hook.
 *
 * @module
 */
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
