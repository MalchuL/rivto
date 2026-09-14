/** Pointer hit-test contracts shared by page drag targeting calculations. */
import type { DropAxis } from "../../../../views/types";

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

/** Why pointer hit-testing chose a particular block. */
export type PointerDropReason = "row" | "nearby-row" | "container" | "chrome";

/** Chosen drop block and the rule that selected it. */
export interface PointerDropHit {
  readonly id: string;
  readonly reason: PointerDropReason;
}

/** Placement rule selected from a pointer hit and layout axes. */
export type HitDropIntent =
  | "chrome"
  | "inside-field"
  | "axis-horizontal"
  | "axis-grid"
  | "axis-vertical"
  | "geometry";
