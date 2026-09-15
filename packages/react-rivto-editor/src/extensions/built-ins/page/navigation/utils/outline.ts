/**
 * Visible page-outline projection used by selection and movement behavior.
 *
 * @module
 */
import type { EditorBlock as Block } from "@chulane/rivto";
import type { IsCollapsedBlock, PageBlockEntry } from "./types";

export type { IsCollapsedBlock, PageBlockEntry } from "./types";

/** Default outline policy that exposes every descendant. */
export const neverCollapsed: IsCollapsedBlock = () => false;

/**
 * Flattens a page outline while retaining structural ownership.
 *
 * @param blocks - Roots to flatten.
 * @param parentId - Parent shared by the current roots.
 * @param includeCollapsedDescendants - Whether collapsed descendants remain visible.
 * @param isCollapsed - Host collapse policy.
 * @returns Visible pre-order entries.
 */
export function pageEntries(
  blocks: Block[],
  parentId: string | null = null,
  includeCollapsedDescendants = false,
  isCollapsed: IsCollapsedBlock = neverCollapsed,
): PageBlockEntry[] {
  return blocks.flatMap((block) => [
    { block, parentId, siblings: blocks },
    ...(isCollapsed(block) && !includeCollapsedDescendants
      ? []
      : pageEntries(block.children, block.id, includeCollapsedDescendants, isCollapsed)),
  ]);
}
