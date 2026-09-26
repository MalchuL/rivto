/** Pointer hit-test contracts shared by page drag targeting calculations. */
import type { DropAxis } from "../../../views/types";

/** Axis-aligned rectangle in viewport coordinates. */
export interface HitRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** One measured block that may own a drop during a pointer drag. */
export interface PointerDropCandidate {
  readonly id: string;
  readonly row: HitRect;
  readonly block: HitRect;
  readonly acceptsDropContainer: boolean;
  readonly ancestorIds: readonly string[];
  readonly dropAxis?: DropAxis;
  readonly childOutline?: "free" | "fixed";
}

/**
 * Why hit-testing chose a block, before the placement resolver decides where
 * the dragged block will go. A row hit alone does not promise an inside drop.
 *
 * Example, from top to bottom (not to scale). Each box is a visible block;
 * the nested block is indented beneath Block 1, and Block 2 is a root sibling:
 *
 * ```text
 * above both blocks: outer-edge -> before Block 1
 * +----------------------------------------+ <- outer-edge, Block 1 top (8px by default)
 * | Block 1 row                            | <- row; chrome if its child outline is fixed
 * +----------------------------------------+
 *      +-----------------------------------+
 *      | Nested block row                  | <- row
 *      +-----------------------------------+
 *                                          <- outer-edge, Block 1 subtree bottom
 *              gap between blocks             <- nearby-row, closest row wins
 * +----------------------------------------+ <- outer-edge, Block 2 top (8px by default)
 * | Block 2 row                            | <- row
 * | Empty accepting body                   | <- container if Block 2 accepts body drops
 * +----------------------------------------+ <- outer-edge, Block 2 bottom
 * below both blocks: outer-edge -> after Block 2
 * ```
 *
 * The boxes show visible rows; the parent BlockView rectangle still spans
 * Block 1 and its indented descendant. The outer-edge strip uses that full
 * rectangle, including children. If the last child's row overlaps Block 1's
 * bottom edge, the pointer hits that row, so nearby-row is never considered.
 * Outer-edge runs first and selects Block 1 for a sibling drop after it.
 * Outside the first or last root, the same reason selects that root rather
 * than a nested row that happens to be nearest to the page padding.
 */
export type PointerDropReason =
  /** Direct hit on a non-fixed block's row, outside its outer-edge strip. */
  | "row"
  /** No row contains the pointer; a gap resolves to a nearby block row. */
  | "nearby-row"
  /** Hit in an accepting block's full body, with no child row taking priority. */
  | "container"
  /** Direct hit on a fixed outline's title row; its direct children are layout slots. */
  | "chrome"
  /** Hit within the configured top/bottom strip (8px by default), or beyond end roots. */
  | "outer-edge";

/** Chosen drop block and the rule that selected it. */
export interface PointerDropHit {
  readonly id: string;
  readonly reason: PointerDropReason;
}

/** Placement rule selected from a pointer hit and layout axes. */
export type HitDropIntent =
  | "sibling-edge"
  | "inside-field"
  | "axis-horizontal"
  | "axis-grid"
  | "axis-vertical"
  | "geometry";
