/**
 * Selection reconciliation when collapsing a page-outline ancestor.
 *
 * @module
 */
import {
  hasBlockRanges,
  isStructuralSelection,
  createStructuralSelection,
  type BlockManagerApi,
  type Selection,
} from "@chulane/rivto";

/**
 * Replaces selection endpoints hidden by a collapsed ancestor with that ancestor.
 *
 * @param blocks - Block lookups for the displayed document.
 * @param selection - Current portable selection.
 * @param boundary - Subtree root; ancestors outside this view do not hide its blocks.
 * @returns Reconciled selection, the unchanged selection, or undefined.
 */
export function reconcileCollapsedSelection(
  blocks: Pick<BlockManagerApi, "getBlockNode" | "getParentId" | "getOrderedIds">,
  selection: Selection | undefined,
  boundary?: string,
): Selection | undefined {
  if (!selection) return undefined;
  const visibleIds = new Map<string, string | undefined>();
  const visibleId = (id: string): string | undefined => {
    if (visibleIds.has(id)) return visibleIds.get(id);
    if (!blocks.getBlockNode(id)) return undefined;
    let visible = id;
    let ancestor = id;
    while (ancestor !== boundary) {
      const parent = blocks.getParentId(ancestor);
      if (!parent) break;
      if (blocks.getBlockNode(parent)?.listProps.collapsed === true) visible = parent;
      ancestor = parent;
    }
    visibleIds.set(id, visible);
    return visible;
  };
  const hiddenBy = (id: string): string | undefined => {
    const visible = visibleId(id);
    return visible === id ? undefined : visible;
  };

  const partial = hasBlockRanges(selection) && !isStructuralSelection(selection) ? selection : undefined;
  if (partial) {
    const ancestor = hiddenBy(partial.blocks[0]?.id ?? "")
      ?? hiddenBy(partial.focusBlockId);
    return ancestor ? createStructuralSelection([ancestor]) : selection;
  }
  if (!hasBlockRanges(selection)) return selection;
  const selected = new Map(selection.blocks.flatMap((block) => {
    const id = visibleId(block.id);
    return id ? [[id, block] as const] : [];
  }));
  const nextBlocks = blocks.getOrderedIds(selected.keys()).map((id) => ({ ...selected.get(id)!, id }));
  const anchorBlockId = hiddenBy(selection.anchorBlockId) ?? selection.anchorBlockId;
  const focusBlockId = hiddenBy(selection.focusBlockId) ?? selection.focusBlockId;
  if (!nextBlocks.length || !selected.has(anchorBlockId) || !selected.has(focusBlockId)) return undefined;
  const changed = nextBlocks.length !== selection.blocks.length
    || nextBlocks.some((block, index) => block.id !== selection.blocks[index]?.id)
    || anchorBlockId !== selection.anchorBlockId
    || focusBlockId !== selection.focusBlockId;
  return changed ? { ...selection, blocks: nextBlocks, anchorBlockId, focusBlockId } : selection;
}
