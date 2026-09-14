/** Canonical data contracts shared by page drag placement calculations. */

/** Minimal recursive shape needed to resolve outline drop positions. */
export interface DropBlock {
  readonly id: string;
  readonly children: readonly DropBlock[];
}

/** One canonical gap in a parent's ordered child list. */
export interface BetweenDropPlacement {
  readonly kind: "between";
  readonly parentId: string | null;
  readonly previousId: string | null;
  readonly nextId: string | null;
  readonly depth: number;
}

/** Placement that appends moved roots as children of one block. */
export interface InsideDropPlacement {
  readonly kind: "inside";
  readonly parentId: string;
}

/** Semantic placement used by React drag feedback. */
export type CanonicalDropPlacement = BetweenDropPlacement | InsideDropPlacement;

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
