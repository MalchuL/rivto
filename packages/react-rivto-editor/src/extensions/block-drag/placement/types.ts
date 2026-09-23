/**
 * Canonical data contracts shared by page drag placement calculations.
 *
 * Everything here is independent of the drag-and-drop library. Pointer and
 * keyboard gestures are adapted into {@link DropPlacementInput} at the provider
 * boundary, so nested-row, empty-lane, grid, horizontal-lane, and indentation
 * rules never depend on dnd-kit event internals.
 *
 * @module
 */
import type { BlockDropPlacementOptions, DropAxis } from "../../../views/types";
import type { PointerDropReason } from "../pointer/types";

/** Axis-aligned viewport rectangle measured from the live DOM. */
export interface ViewportRect {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** Layout context attached to a draggable block and to keyboard drop targets. */
export interface PageDragData {
  readonly sortChildren: DropAxis | undefined;
  readonly targetDropPlacement?: BlockDropPlacementOptions;
  readonly parentDropPlacement?: BlockDropPlacementOptions;
}

/**
 * Layout context of one candidate drop target.
 *
 * Pointer hit testing enriches the shared block data with the rule that chose
 * the block and its container capabilities; keyboard targets omit those fields
 * and fall back to ordinary row semantics.
 */
export interface PageDropTargetData extends PageDragData {
  readonly hitReason?: PointerDropReason;
  readonly targetAcceptsDrop?: boolean;
  readonly parentChildOutline?: "free" | "fixed";
}

/** The block being moved, as seen by placement resolution. */
export interface DropPlacementSource {
  readonly id: string;
  readonly data: PageDragData | undefined;
  /**
   * Translated source geometry standing in for the cursor during keyboard
   * movement, or null when the gesture has a live pointer.
   */
  readonly rect: ViewportRect | null;
}

/** The block currently targeted by the gesture, as seen by placement resolution. */
export interface DropPlacementTarget {
  readonly id: string;
  readonly rect: ViewportRect;
  readonly data: PageDropTargetData | undefined;
}

/** Library-independent description of one candidate drop. */
export interface DropPlacementInput {
  readonly source: DropPlacementSource;
  readonly target: DropPlacementTarget;
}

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
