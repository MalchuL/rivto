/**
 * Converts measured block anchors into bullet-threading SVG path data.
 *
 * The generated path follows the ancestry chain of the focused block.
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
 * descendants. The first measurable earlier root extends the top-level trunk
 * above the active ancestry.
 *
 * @param options - Surface, traversal rules, and anchor measurements.
 * @returns Complete SVG path data, or an empty string when nothing is drawable.
 */
export function buildThreadPath({ root, rootLineOffset, excluded, continued, point }: ThreadPathOptions): string {
  const canContinue = (block: Element) => {
    const type = block.getAttribute("data-block-type") ?? "";
    return !excluded.has(type) && (!continued || continued.has(type));
  };
  const active = root.ownerDocument.activeElement;
  const focused = active && root.contains(active) ? active.closest(BLOCK) : null;
  if (!focused) return "";

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
  let path = "";
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
  return path.trim();
}
