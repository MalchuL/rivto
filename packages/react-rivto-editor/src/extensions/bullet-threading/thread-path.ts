/**
 * Converts measured block anchors into bullet-threading SVG path data.
 *
 * The generated path follows the ancestry chain of the focused block.
 *
 * @module
 */
import type { InputRegion } from "@chulane/rivto-root";
import { BLOCK_ID_SELECTOR } from "../../constants";
import { PANEL_SELECTOR } from "../../panels/panel-dom";
import type { ThreadPathOptions } from "./types";

const ROOT_LEAD_RADIUS = 6;

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
 * @param options - Surface, focused block, traversal rules, and anchor measurements.
 * @returns Complete SVG path data, or an empty string when nothing is drawable.
 */
export function buildThreadPath({
  root,
  inputRoot,
  focused,
  rootLineOffset,
  excluded,
  continued,
  point,
}: ThreadPathOptions): string {
  const blocks = getAncestry(root, focused);
  if (!blocks.length) {
    return "";
  }
  // A container stays connected to its parent, but its own descendants do not get threads.
  const stop = blocks.findIndex((block) => {
    const type = block.readAttribute("data-block-type") ?? "";
    return excluded.has(type) || Boolean(continued && !continued.has(type));
  });
  if (stop >= 0) {
    blocks.length = stop + 1;
  }
  // Direct and wrapped root blocks share the same document boundary regardless of wrapper depth.
  let topStart: InputRegion | undefined;
  const visited = inputRoot.someTopLevelRegion(BLOCK_ID_SELECTOR, PANEL_SELECTOR, (block) => {
    if (block.isSame(blocks[0]!)) {
      return true;
    }
    if (point(block)) {
      topStart = block;
      return true;
    }
    return false;
  });
  if (visited === undefined) {
    return "";
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
  return appendThreadLinks(blocks, point, rootLineOffset, Boolean(topStart), path);
}

/**
 * Collects the focused block and its rendered ancestors inside the occurrence.
 *
 * @param root - Current surface region.
 * @param focused - Focused block region.
 * @returns Root-to-leaf block regions, or an empty list if ownership changes.
 */
function getAncestry(root: InputRegion, focused: InputRegion): InputRegion[] {
  const blocks: InputRegion[] = [];
  const result = focused.someAncestorWithin(root, (region) => {
    if (region.matches(BLOCK_ID_SELECTOR)) {
      blocks.unshift(region);
    }
    return false;
  });
  return result === false ? blocks : [];
}

/**
 * Appends links between measured blocks until a missing or reversed anchor.
 *
 * @param blocks - Root-to-leaf sequence including any earlier top-level block.
 * @param point - Cached anchor measurement for a rendered block.
 * @param rootLineOffset - Horizontal offset of the top-level trunk in CSS pixels.
 * @param hasTopStart - Whether the first block is an earlier top-level anchor.
 * @param initialPath - Optional lead already created for the first block.
 * @returns Complete trimmed SVG path.
 */
function appendThreadLinks(
  blocks: readonly InputRegion[],
  point: ThreadPathOptions["point"],
  rootLineOffset: number,
  hasTopStart: boolean,
  initialPath: string,
): string {
  let path = initialPath;
  for (let index = 1; index < blocks.length; index += 1) {
    const from = point(blocks[index - 1]!);
    const to = point(blocks[index]!);
    if (!from || !to) {
      break;
    }
    // The first link begins below an earlier root; later links begin at their parent anchor.
    const fromX = index === 1 && hasTopStart ? to.x - rootLineOffset : from.x;
    const fromY = index === 1 && hasTopStart ? from.bottom : from.y;
    if (to.y <= fromY) {
      break;
    }
    if (!path) {
      path = `M ${fromX} ${fromY}`;
    }
    path += curve(fromX, fromY, to.x, to.y);
  }
  return path.trim();
}
