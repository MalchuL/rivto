/**
 * Selection reconciliation when collapsing a page-outline ancestor.
 *
 * @module
 */
import {
  hasBlockRanges,
  isStructuralSelection,
  type EditorBlock as Block,
  type Selection,
} from "@chulane/rivto";
import { blockSelection } from "./block-selection";
import { pageEntries } from "./outline";

/**
 * Replaces selection endpoints hidden by a collapsed ancestor with that ancestor.
 *
 * @param blocks - Complete page outline.
 * @param selection - Current portable selection.
 * @returns Reconciled selection, the unchanged selection, or undefined.
 */
export function reconcileCollapsedSelection(
  blocks: Block[],
  selection: Selection | undefined,
): Selection | undefined {
  if (!selection) return undefined;
  const isCollapsed = (block: Block) => block.listProps.collapsed === true;
  const visible = pageEntries(blocks, null, false, isCollapsed).map(({ block }) => block.id);
  const visibleSet = new Set(visible);
  const hiddenBy = new Map<string, string>();

  const indexHidden = (items: Block[], collapsedAncestor?: string): void => {
    items.forEach((block) => {
      if (collapsedAncestor) hiddenBy.set(block.id, collapsedAncestor);
      const ancestor = collapsedAncestor ?? (block.listProps.collapsed === true ? block.id : undefined);
      indexHidden(block.children, ancestor);
    });
  };
  indexHidden(blocks);

  const partial = hasBlockRanges(selection) && !isStructuralSelection(selection) ? selection : undefined;
  if (partial) {
    const ancestor = hiddenBy.get(partial.blocks[0]?.id ?? "")
      ?? hiddenBy.get(partial.focusBlockId);
    return ancestor ? blockSelection(blocks, ancestor) : selection;
  }
  if (!hasBlockRanges(selection)) return selection;
  const selected = new Map(selection.blocks.map((block) => [hiddenBy.get(block.id) ?? block.id, block]));
  const nextBlocks = visible.flatMap((id) => {
    const source = selected.get(id);
    return source ? [{ id, start: source.start, end: source.end }] : [];
  });
  const anchorBlockId = hiddenBy.get(selection.anchorBlockId) ?? selection.anchorBlockId;
  const focusBlockId = hiddenBy.get(selection.focusBlockId) ?? selection.focusBlockId;
  if (!nextBlocks.length || !visibleSet.has(anchorBlockId) || !visibleSet.has(focusBlockId)) return undefined;
  const changed = nextBlocks.length !== selection.blocks.length
    || nextBlocks.some((block, index) => block.id !== selection.blocks[index]?.id)
    || anchorBlockId !== selection.anchorBlockId
    || focusBlockId !== selection.focusBlockId;
  return changed ? { ...selection, blocks: nextBlocks, anchorBlockId, focusBlockId } : selection;
}
