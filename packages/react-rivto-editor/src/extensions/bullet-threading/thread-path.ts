/**
 * Converts measured block anchors into bullet-threading SVG path data.
 *
 * Focused mode follows one ancestry chain. All mode draws a shared root trunk
 * and then walks every visible descendant branch.
 *
 * @module
 */
import { BLOCK_ID_SELECTOR } from "../../constants";

const BLOCK = `.page-block${BLOCK_ID_SELECTOR}`;
/** Direct and single-wrapper root blocks supported by page container renderers. */
const ROOT_BLOCKS = `:scope > ${BLOCK}, :scope > :not(.page-block) > ${BLOCK}`;
const ROOT_LEAD_RADIUS = 6;

/** Measured anchor coordinates relative to the body-hosted overlay. */
export interface ThreadPoint {
  /** Horizontal center of the anchor. */
  readonly x: number;
  /** Vertical center of the anchor. */
  readonly y: number;
  /** Bottom edge used when a root trunk continues below an earlier block. */
  readonly bottom: number;
}

interface ThreadPathOptions {
  readonly root: Element;
  readonly resolution: "focused" | "all" | "none";
  readonly rootLineOffset: number;
  readonly excluded: ReadonlySet<string>;
  readonly continued: ReadonlySet<string> | null;
  readonly point: (block: Element) => ThreadPoint | null;
}

/**
 * Builds a rounded vertical-to-horizontal link between two anchors.
 *
 * The radius is limited by both axes so short and leftward links do not
 * overshoot their endpoint.
 *
 * @param fromX - Starting horizontal coordinate.
 * @param fromY - Starting vertical coordinate.
 * @param toX - Destination horizontal coordinate.
 * @param toY - Destination vertical coordinate.
 * @returns SVG path commands continuing from the current point.
 */
function curve(fromX: number, fromY: number, toX: number, toY: number): string {
  const radius = Math.min(10, Math.abs(toX - fromX), (toY - fromY) / 2);
  const turn = Math.sign(toX - fromX) * radius;
  return ` V ${toY - radius} Q ${fromX} ${toY} ${fromX + turn} ${toY} H ${toX}`;
}

/**
 * Builds one SVG path from the current rendered block geometry.
 *
 * Excluded blocks retain their incoming link but stop traversal before their
 * descendants. Focused mode also uses the first measurable earlier root to
 * extend the top-level trunk above the active ancestry.
 *
 * @param options - Surface, resolution, traversal rules, and anchor measurements.
 * @returns Complete SVG path data, or an empty string when nothing is drawable.
 */
export function buildThreadPath({ root, resolution, rootLineOffset, excluded, continued, point }: ThreadPathOptions): string {
  if (resolution === "none") return "";
  const canContinue = (block: Element) => {
    const type = block.getAttribute("data-block-type") ?? "";
    return !excluded.has(type) && (!continued || continued.has(type));
  };
  let path = "";

  if (resolution === "focused") {
    const active = root.ownerDocument.activeElement;
    const focused = active && root.contains(active) ? active.closest(BLOCK) : null;
    if (focused) {
      const roots = root.querySelectorAll(ROOT_BLOCKS);
      const blocks: Element[] = [];
      for (let block: Element | null = focused; block && root.contains(block); block = block.parentElement?.closest(BLOCK) ?? null) {
        blocks.unshift(block);
      }
      // A container stays connected to its parent, but its own descendants do not get threads.
      const stop = blocks.findIndex((block) => !canContinue(block));
      if (stop >= 0) blocks.length = stop + 1;
      let topStart: Element | undefined;
      for (const sibling of roots) {
        if (sibling === blocks[0]) break;
        if (!topStart && point(sibling)) topStart = sibling;
      }
      if (topStart) {
        blocks.unshift(topStart);
      } else {
        // With no earlier root, start a short lead above the first visible anchor.
        const first = point(blocks[0]!);
        if (first) {
          const fromX = first.x - rootLineOffset;
          const fromY = first.y - ROOT_LEAD_RADIUS * 2;
          path = `M ${fromX} ${fromY}${curve(fromX, fromY, first.x, first.y)}`;
        }
      }
      for (let index = 1; index < blocks.length; index += 1) {
        const from = point(blocks[index - 1]!);
        const to = point(blocks[index]!);
        if (!from || !to) break;
        // The first link begins below an earlier root; later links begin at their parent anchor.
        const fromX = index === 1 && Boolean(topStart) ? to.x - rootLineOffset : from.x;
        const fromY = index === 1 && Boolean(topStart) ? from.bottom : from.y;
        if (to.y <= fromY) break;
        if (!path) path = `M ${fromX} ${fromY}`;
        path += curve(fromX, fromY, to.x, to.y);
      }
    }
  } else {
    const roots = Array.from(root.querySelectorAll(ROOT_BLOCKS));
    const drawSiblings = (siblings: Iterable<Element>) => {
      const points = Array.from(siblings, point).filter((item): item is ThreadPoint => Boolean(item));
      if (!points.length) return;
      const trunkX = points.reduce((minimum, item) => Math.min(minimum, item.x), Infinity) - rootLineOffset;
      if (points.length === 1) {
        const item = points[0]!;
        const fromY = item.y - ROOT_LEAD_RADIUS * 2;
        path += ` M ${trunkX} ${fromY}${curve(trunkX, fromY, item.x, item.y)}`;
        return;
      }
      // One shared trunk joins all root anchors, avoiding a separate vertical line per root.
      path += ` M ${trunkX} ${points[0]!.y - ROOT_LEAD_RADIUS} V ${points.at(-1)!.y}`;
      for (const item of points) {
        const radius = Math.min(ROOT_LEAD_RADIUS, item.x - trunkX);
        path += ` M ${trunkX} ${item.y - radius} Q ${trunkX} ${item.y} ${trunkX + radius} ${item.y} H ${item.x}`;
      }
    };
    drawSiblings(roots);
    // Walk visible descendants only; excluded containers keep their incoming link.
    const stack = [...roots];
    while (stack.length) {
      const parent = stack.pop()!;
      const from = point(parent);
      const children = parent.querySelectorAll(":scope > .page-block-children > .page-block");
      if (!from || !canContinue(parent)) continue;
      for (const child of children) {
        const to = point(child);
        if (to && to.y > from.y) path += ` M ${from.x} ${from.y}${curve(from.x, from.y, to.x, to.y)}`;
        stack.push(child);
      }
    }
  }
  return path.trim();
}
