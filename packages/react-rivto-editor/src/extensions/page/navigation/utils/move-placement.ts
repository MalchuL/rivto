/**
 * Structural destination calculation for keyboard block movement.
 *
 * @module
 */
import type { EditorBlock as Block } from "@chulane/rivto";
import { neverCollapsed, pageEntries } from "./outline";
import type { IsCollapsedBlock, KeyboardMovePlacement } from "./types";

export type { KeyboardMovePlacement } from "./types";

/**
 * Resolves sibling swapping and parent-boundary movement.
 *
 * @param blocks - Complete outline roots.
 * @param movedIds - Structural roots moved together.
 * @param direction - Requested movement direction.
 * @param isCollapsed - Host collapse policy.
 * @returns Valid destination, or undefined at the outline boundary.
 */
export function keyboardMovePlacement(
  blocks: Block[],
  movedIds: string[],
  direction: "up" | "down",
  isCollapsed: IsCollapsedBlock = neverCollapsed,
): KeyboardMovePlacement | undefined {
  const entries = pageEntries(blocks, null, false, isCollapsed);
  const byId = new Map(entries.map((entry) => [entry.block.id, entry]));
  const moved = new Set(movedIds);
  const roots = entries.filter(({ block }) => moved.has(block.id));
  const first = roots[0];
  const last = roots.at(-1);
  if (!first || !last || first.parentId !== last.parentId) return;
  const siblings = first.siblings;
  const firstIndex = siblings.findIndex((block) => block.id === first.block.id);
  const lastIndex = siblings.findIndex((block) => block.id === last.block.id);

  let placement: KeyboardMovePlacement | undefined;
  if (direction === "up") {
    const previous = siblings.slice(0, firstIndex).reverse().find((block) => !moved.has(block.id));
    if (previous) placement = { targetId: previous.id, position: "before" };
    else if (first.parentId) placement = { targetId: first.parentId, position: "before" };
  } else {
    const next = siblings.slice(lastIndex + 1).find((block) => !moved.has(block.id));
    if (next) {
      placement = { targetId: next.id, position: "after" };
    } else if (last.parentId) {
      const parent = byId.get(last.parentId);
      const parentIndex = parent?.siblings.findIndex((block) => block.id === last.parentId) ?? -1;
      if (parent && parentIndex >= 0 && parentIndex < parent.siblings.length - 1) {
        placement = { targetId: last.parentId, position: "after" };
      }
    }
  }
  return placement;
}
