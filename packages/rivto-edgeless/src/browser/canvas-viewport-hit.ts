import type { InputRoot } from "@chulane/rivto-root";
import type { Point } from "../types/canvas";

/**
 * Tests the topmost document hit against one current canvas occurrence.
 *
 * Exclusions are checked against the hit's complete ancestry, including ancestors
 * outside the viewport. The captured hit is released before this function returns.
 *
 * @param root - Borrowed occurrence providing document and region capture.
 * @param isCurrent - Checks that the originating viewport attachment remains published.
 * @param point - Viewport coordinates in CSS pixels.
 * @param excludedSelector - Optional selector excluding a hit or any ancestor.
 * @returns True only for a current hit inside the occurrence without an excluded ancestor.
 * @throws Propagates browser hit testing, selector, and ownership failures.
 */
export function containsCanvasViewportPoint(
  root: Pick<InputRoot, "captureDocument" | "captureRegionByIdentity">,
  isCurrent: () => boolean,
  point: Point,
  excludedSelector?: string,
): boolean {
  if (!isCurrent()) {
    return false;
  }
  const hit = root.captureDocument()?.captureHit(point.x, point.y);
  if (!hit) {
    return false;
  }
  try {
    const identity = hit.getNearestAncestorIdentity("*");
    const region = identity && root.captureRegionByIdentity(identity, isCurrent);
    if (!region || !isCurrent()) {
      return false;
    }
    const excluded = excludedSelector && hit.getNearestAncestorIdentity(excludedSelector);
    // An ownership check can synchronously replace the attachment or move the hit.
    return (
      !excluded &&
      !!region.getIdentity() &&
      hit.isCurrent() &&
      isCurrent() &&
      !!region.getIdentity() &&
      hit.isCurrent()
    );
  } finally {
    hit.release();
  }
}
