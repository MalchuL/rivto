/** Drag-source subtree collection used to reject cyclic destinations. */
import type { EditorBlock as Block } from "@chulane/rivto";

/**
 * Adds every ID in a block's complete persisted subtree to one lookup set.
 *
 * This deliberately includes collapsed descendants: they are hidden visually
 * but remain owned by the moved root and therefore cannot be valid targets.
 *
 * @param block - Root of the subtree to inspect.
 * @param ids - Mutable drag-local set receiving the subtree IDs.
 * @returns No value.
 */
export function collectSubtreeIds(block: Block, ids: Set<string>): void {
  ids.add(block.id);
  block.children.forEach((child) => collectSubtreeIds(child, ids));
}
