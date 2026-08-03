import type {
  EditorBlock as Block,
  EditorBlockLayout as BlockLayout,
} from "@chulane/rivto";

/** Rectangle expressed in viewport coordinates. */
export interface EdgelessRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Finds the document root that owns a root or deeply nested block ID. */
export function rootOwnerId(blocks: readonly Block[], blockId: string): string | undefined {
  const contains = (block: Block): boolean => (
    block.id === blockId || block.children.some(contains)
  );
  return blocks.find(contains)?.id;
}

/** Maps arbitrary block IDs to unique owning roots in document order. */
export function owningRootIds(blocks: readonly Block[], blockIds: readonly string[]): string[] {
  const requested = new Set(blockIds);
  const containsRequested = (block: Block): boolean => (
    requested.has(block.id) || block.children.some(containsRequested)
  );
  return blocks.filter(containsRequested).map((block) => block.id);
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

/** Produces ordered layout patches for one grouped canvas translation. */
export function translatedLayouts(
  blocks: readonly Block[],
  ids: readonly string[],
  dx: number,
  dy: number,
): Array<{ id: string; layout: Pick<BlockLayout, "x" | "y"> }> {
  const roots = new Map(blocks.map((block) => [block.id, block]));
  return ids.flatMap((id) => {
    const block = roots.get(id);
    return block?.layout
      ? [{ id, layout: { x: block.layout.x + dx, y: block.layout.y + dy } }]
      : [];
  });
}
