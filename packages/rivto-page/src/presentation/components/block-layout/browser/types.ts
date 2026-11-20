import type { InputRoot } from "@chulane/rivto-root";

/** Root operations borrowed by row hover while the current occurrence is attached. */
export type BlockHoverRoot = Pick<
  InputRoot,
  "captureRegionByIdentity" | "getElementIdentity" | "isAttached"
>;

/** Viewport coordinates retained only while a mouse or pen is over this occurrence. */
export interface BlockHoverPoint {
  readonly x: number;
  readonly y: number;
}
