/** Rectangle expressed in viewport coordinates. */
export interface EdgelessRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Returns root IDs whose rendered rectangles intersect a selection rectangle. */
export function rootsInRect(
  roots: readonly { id: string; rect: EdgelessRect }[],
  selection: EdgelessRect,
): string[] {
  return roots.filter(({ rect }) => !(
    rect.right < selection.left ||
    rect.left > selection.right ||
    rect.bottom < selection.top ||
    rect.top > selection.bottom
  )).map(({ id }) => id);
}

/** Converts a viewport pointer delta to unscaled canvas coordinates. */
export function canvasDelta(delta: number, zoom: number): number {
  return delta / Math.max(zoom, 0.01);
}
