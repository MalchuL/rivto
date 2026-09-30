/**
 * Canonical data contracts shared by page drag placement calculations.
 *
 * Pointer and keyboard adapters share stable destinations, independent of
 * dnd-kit events and DOM hit reasons.
 *
 * @module
 */
import type { BlockDropDestination } from "../../../views/types";

/** Minimal recursive shape needed to resolve outline drop positions. */
export interface DropBlock {
  readonly id: string;
  readonly children: readonly DropBlock[];
}

/** One canonical gap in a parent's ordered child list. */
export type BetweenDropPlacement = Extract<BlockDropDestination, { readonly kind: "between" }>;

/** Placement that appends moved roots as children of one block. */
export type InsideDropPlacement = Extract<BlockDropDestination, { readonly kind: "inside" }>;

/** Semantic placement used by React drag feedback. */
export type CanonicalDropPlacement = BlockDropDestination;

/** Existing core move-command target derived from a semantic placement. */
export interface DropMoveTarget {
  readonly targetId: string | null;
  readonly position: "before" | "after" | "inside";
}

/** Fully resolved values after provider defaults and block-view overrides. */
export interface ResolvedDropPlacementOptions {
  readonly allowChildPlacement: boolean;
  readonly childDropIndent: number;
  readonly gapDropZone: number;
}

/** Block location together with its owning sibling list and ancestor path. */
export interface DropBlockLocation {
  readonly block: DropBlock;
  readonly siblings: readonly DropBlock[];
  readonly parentId: string | null;
  readonly depth: number;
  readonly path: readonly DropBlock[];
}
