/**
 * Construction and movement of portable whole-block page selections.
 *
 * @module
 */
import {
  assertBlockRangeEndpoints,
  createStructuralSelection,
  type EditorBlock as Block,
  type Selection,
} from "@chulane/rivto";
import { neverCollapsed, pageEntries, type IsCollapsedBlock } from "./outline";

/**
 * Creates one contiguous whole-block selection spanning anchor through focus.
 *
 * @param blocks - Complete outline roots.
 * @param anchorBlockId - Stable selection anchor.
 * @param focusBlockId - Active selection edge.
 * @param isCollapsed - Host collapse policy.
 * @returns Contiguous structural selection.
 */
export function blockSelection(
  blocks: Block[],
  anchorBlockId: string,
  focusBlockId = anchorBlockId,
  isCollapsed: IsCollapsedBlock = neverCollapsed,
): Selection {
  const ids = pageEntries(blocks, null, false, isCollapsed).map(({ block }) => block.id);
  const anchor = ids.indexOf(anchorBlockId);
  const focus = ids.indexOf(focusBlockId);
  return createStructuralSelection(
    ids.slice(Math.min(anchor, focus), Math.max(anchor, focus) + 1),
    anchorBlockId,
    focusBlockId,
  );
}

/**
 * Toggles one complete block in a possibly non-contiguous selection.
 *
 * @param blocks - Complete outline roots.
 * @param current - Existing portable selection.
 * @param blockId - Block toggled by the gesture.
 * @param includeCollapsedDescendants - Whether hidden descendants participate.
 * @param isCollapsed - Host collapse policy.
 * @returns Updated structural selection, or undefined when empty.
 */
export function toggleBlockSelection(
  blocks: Block[],
  current: Selection | undefined,
  blockId: string,
  includeCollapsedDescendants = false,
  isCollapsed: IsCollapsedBlock = neverCollapsed,
): Selection | undefined {
  if (current) assertBlockRangeEndpoints(current);
  const visible = pageEntries(blocks, null, includeCollapsedDescendants, isCollapsed).map(({ block }) => block.id);
  const previous = new Map(current?.blocks.map((block) => [block.id, block]) ?? []);
  const selected = new Set(previous.keys());
  const removing = selected.has(blockId);
  if (removing) selected.delete(blockId);
  else selected.add(blockId);
  const ids = visible.filter((id) => selected.has(id));
  if (!ids.length) return;
  return {
    type: "selection",
    blocks: ids.map((id) => previous.get(id) ?? { id, start: 0, end: -1 }),
    anchorBlockId: current && selected.has(current.anchorBlockId) ? current.anchorBlockId : ids[0]!,
    focusBlockId: removing && current && selected.has(current.focusBlockId)
      ? current.focusBlockId
      : removing ? ids.at(-1)! : blockId,
  };
}

/**
 * Grows or shrinks a contiguous block selection.
 *
 * @param blocks - Complete outline roots.
 * @param current - Current structural selection.
 * @param direction - Visible direction to extend.
 * @param isCollapsed - Host collapse policy.
 * @returns Updated structural selection.
 */
export function extendBlockSelection(
  blocks: Block[],
  current: Selection,
  direction: "up" | "down",
  isCollapsed: IsCollapsedBlock = neverCollapsed,
): Selection {
  assertBlockRangeEndpoints(current);
  const ids = pageEntries(blocks, null, false, isCollapsed).map(({ block }) => block.id);
  const anchor = ids.indexOf(current.anchorBlockId);
  const focus = ids.indexOf(current.focusBlockId);
  if (anchor < 0 || focus < 0) return current;
  const delta = direction === "up" ? -1 : 1;
  const next = Math.max(0, Math.min(ids.length - 1, focus + delta));
  return blockSelection(blocks, current.anchorBlockId, ids[next]!, isCollapsed);
}

/**
 * Moves a whole-block selection to one adjacent visible block.
 *
 * @param blocks - Complete outline roots.
 * @param current - Current structural selection.
 * @param direction - Visible movement direction.
 * @param isCollapsed - Host collapse policy.
 * @returns Adjacent selection or the unchanged boundary selection.
 */
export function adjacentBlockSelection(
  blocks: Block[],
  current: Selection,
  direction: "up" | "down",
  isCollapsed: IsCollapsedBlock = neverCollapsed,
): Selection {
  const ids = pageEntries(blocks, null, false, isCollapsed).map(({ block }) => block.id);
  const edgeId = direction === "up" ? current.blocks[0]?.id : current.blocks.at(-1)?.id;
  const index = edgeId ? ids.indexOf(edgeId) : -1;
  const next = index < 0 ? undefined : ids[index + (direction === "up" ? -1 : 1)];
  return next ? blockSelection(blocks, next, next, isCollapsed) : current;
}
