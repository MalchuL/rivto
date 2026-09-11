/**
 * Selection contracts and browser interaction helpers. Block coverage uses
 * per-block start/end offsets; Ctrl/Cmd+click stores `0, -1`.
 */
import {
  createStructuralSelection,
  assertBlockRangeEndpoints,
  hasBlockRanges,
  isStructuralSelection,
  getSelectedBlockIds,
  type EditorBlock as Block,
  type Selection,
} from "@chulane/rivto";

/** One block's location in the visible outline. */
export interface PageBlockEntry {
  readonly block: Block;
  readonly parentId: string | null;
  readonly siblings: Block[];
}

/** Extension-owned decision that hides one block's descendants. */
export type IsCollapsedBlock = (block: Block) => boolean;

const neverCollapsed: IsCollapsedBlock = () => false;

/** Flattens a page outline while retaining structural ownership. */
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

/**
 * Replaces selection endpoints hidden by a collapsed ancestor with that
 * ancestor. Text cannot retain a meaningful DOM range once either endpoint is
 * hidden, so it becomes a whole-block range across the remaining visible rows.
 * Returning the original value when nothing changed prevents revision loops in
 * PageCollapsePlugin's document-change reconciliation effect.
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

/**
 * Creates one contiguous whole-block selection spanning `anchor`…`focus`.
 *
 * Unlike {@link toggleBlockSelection}, this always fills every visible ID
 * between the endpoints. Gesture direction is preserved: click/extend from
 * later to earlier keeps `anchorBlockId` after `focusBlockId` in the tree.
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
  const first = Math.min(anchor, focus);
  const last = Math.max(anchor, focus);
  return createStructuralSelection(ids.slice(first, last + 1), anchorBlockId, focusBlockId);
}

/**
 * Toggles one complete block into a possibly non-contiguous selection.
 *
 * `blockIds` stay in visible document order with gaps allowed. Anchor/focus
 * track the Ctrl/Cmd+click gesture, not fill-between semantics:
 *
 * - **anchor**: keep the previous anchor while it remains selected; otherwise
 *   the first remaining ID.
 * - **focus**: when adding, the clicked block; when removing, the previous
 *   focus if still selected, else the last remaining ID.
 *
 * Example: clicks `1 → 10 → 3` yield
 * `{ blocks: [{id:"1",start:0,end:0}, ...], anchorBlockId: "1", focusBlockId: "3" }`.
 * Clicks `3 → 10 → 1` share the same `blockIds` but
 * `anchorBlockId: "3", focusBlockId: "1"`.
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

/** Grows or shrinks a contiguous block selection. */
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

/** Moves a whole-block selection to one adjacent visible block. */
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

/** Roots moved by a drag or keyboard command. */
export interface SelectedMoveRoots {
  readonly ids: string[];
  readonly grouped: boolean;
  readonly selection?: Selection;
}

/**
 * Resolves an eligible selected sibling group, otherwise the active block.
 * Selected descendants disappear from the root list because their ancestor
 * carries the complete subtree.
 */
export function selectedMoveRoots(
  blocks: Block[],
  selection: Selection | undefined,
  activeId: string,
  isCollapsed: IsCollapsedBlock = neverCollapsed,
): SelectedMoveRoots {
  const blockSelection = selection && hasBlockRanges(selection)
    && isStructuralSelection(selection) && getSelectedBlockIds(selection).includes(activeId)
    ? selection : undefined;
  let result: SelectedMoveRoots = { ids: [activeId], grouped: false };
  if (blockSelection) {
    const entries = pageEntries(blocks, null, false, isCollapsed);
    const byId = new Map(entries.map((entry) => [entry.block.id, entry]));
    const selected = new Set(getSelectedBlockIds(blockSelection));
    const roots = entries.flatMap(({ block }) => {
      let parentId = byId.get(block.id)?.parentId;
      let ancestorSelected = false;
      while (parentId) {
        if (selected.has(parentId)) {
          ancestorSelected = true;
          break;
        }
        parentId = byId.get(parentId)?.parentId;
      }
      return !ancestorSelected && selected.has(block.id) ? [block.id] : [];
    });
    const parentIds = new Set(roots.map((id) => byId.get(id)?.parentId));
    if (roots.length > 1 && parentIds.size === 1) {
      result = { ids: roots, grouped: true, selection: blockSelection };
    }
  }
  return result;
}

/** Concrete placement used by Alt+Shift+Up/Down. */
export interface KeyboardMovePlacement {
  readonly targetId: string;
  readonly position: "before" | "after";
}

/** Resolves sibling swapping and parent-boundary movement. */
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
