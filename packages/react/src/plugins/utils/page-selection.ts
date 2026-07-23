import {
  isBlockCollapsed,
  type BlockSelection,
  type EditorBlock,
  type EditorSelection,
} from "@chulane/rivto";

/** One block's location in the visible outline. */
export interface PageBlockEntry {
  readonly block: EditorBlock;
  readonly parentId: string | null;
  readonly siblings: EditorBlock[];
}

/** Flattens a page outline while retaining structural ownership. */
export function pageEntries(blocks: EditorBlock[], parentId: string | null = null): PageBlockEntry[] {
  return blocks.flatMap((block) => [
    { block, parentId, siblings: blocks },
    ...(isBlockCollapsed(block) ? [] : pageEntries(block.children, block.id)),
  ]);
}

/**
 * Replaces selection endpoints hidden by a collapsed ancestor with that
 * ancestor. Text cannot retain a meaningful DOM range once either endpoint is
 * hidden, so it becomes a whole-block range across the remaining visible rows.
 * Returning the original array when nothing changed prevents revision loops in
 * PageCollapsePlugin's document-change reconciliation effect.
 */
export function reconcileCollapsedSelection(
  blocks: EditorBlock[],
  selection: EditorSelection,
): EditorSelection {
  const visible = pageEntries(blocks).map(({ block }) => block.id);
  const visibleSet = new Set(visible);
  const hiddenBy = new Map<string, string>();

  const indexHidden = (items: EditorBlock[], collapsedAncestor?: string): void => {
    items.forEach((block) => {
      if (collapsedAncestor) hiddenBy.set(block.id, collapsedAncestor);
      const ancestor = collapsedAncestor ?? (isBlockCollapsed(block) ? block.id : undefined);
      indexHidden(block.children, ancestor);
    });
  };
  indexHidden(blocks);

  let changed = false;
  const mapped: EditorSelection = [];
  selection.forEach((item) => {
    if (item.type === "edgeless") {
      mapped.push(item);
      return;
    }
    if (item.type === "text") {
      const anchorBlockId = hiddenBy.get(item.anchor.blockId) ?? item.anchor.blockId;
      const focusBlockId = hiddenBy.get(item.head.blockId) ?? item.head.blockId;
      if (anchorBlockId === item.anchor.blockId && focusBlockId === item.head.blockId) {
        mapped.push(item);
      } else {
        changed = true;
        mapped.push(blockSelection(blocks, anchorBlockId, focusBlockId));
      }
      return;
    }

    const selected = new Set(item.blockIds.map((id) => hiddenBy.get(id) ?? id));
    const blockIds = visible.filter((id) => selected.has(id));
    const anchorBlockId = hiddenBy.get(item.anchorBlockId) ?? item.anchorBlockId;
    const focusBlockId = hiddenBy.get(item.focusBlockId) ?? item.focusBlockId;
    if (!blockIds.length || !visibleSet.has(anchorBlockId) || !visibleSet.has(focusBlockId)) {
      changed = true;
      return;
    }
    if (
      blockIds.length !== item.blockIds.length ||
      blockIds.some((id, index) => id !== item.blockIds[index]) ||
      anchorBlockId !== item.anchorBlockId ||
      focusBlockId !== item.focusBlockId
    ) changed = true;
    mapped.push({ ...item, blockIds, anchorBlockId, focusBlockId });
  });
  return changed ? mapped : selection;
}

/** Creates one whole-block selection with visible-order IDs. */
export function blockSelection(
  blocks: EditorBlock[],
  anchorBlockId: string,
  focusBlockId = anchorBlockId,
): BlockSelection {
  const ids = pageEntries(blocks).map(({ block }) => block.id);
  const anchor = ids.indexOf(anchorBlockId);
  const focus = ids.indexOf(focusBlockId);
  const first = Math.min(anchor, focus);
  const last = Math.max(anchor, focus);
  return {
    type: "block",
    blockIds: ids.slice(first, last + 1),
    anchorBlockId,
    focusBlockId,
  };
}

/** Toggles one complete block while retaining a useful range anchor. */
export function toggleBlockSelection(
  blocks: EditorBlock[],
  current: BlockSelection | undefined,
  blockId: string,
): BlockSelection | undefined {
  const visible = pageEntries(blocks).map(({ block }) => block.id);
  const selected = new Set(current?.blockIds ?? []);
  const removing = selected.has(blockId);
  if (removing) selected.delete(blockId);
  else selected.add(blockId);
  const blockIds = visible.filter((id) => selected.has(id));
  if (!blockIds.length) return;
  return {
    type: "block",
    blockIds,
    anchorBlockId: current && selected.has(current.anchorBlockId) ? current.anchorBlockId : blockIds[0]!,
    focusBlockId: removing && current && selected.has(current.focusBlockId)
      ? current.focusBlockId
      : removing ? blockIds.at(-1)! : blockId,
  };
}

/** Grows or shrinks a contiguous block selection like Logseq. */
export function extendBlockSelection(
  blocks: EditorBlock[],
  current: BlockSelection,
  direction: "up" | "down",
): BlockSelection {
  const ids = pageEntries(blocks).map(({ block }) => block.id);
  const anchor = ids.indexOf(current.anchorBlockId);
  const focus = ids.indexOf(current.focusBlockId);
  if (anchor < 0 || focus < 0) return current;
  const delta = direction === "up" ? -1 : 1;
  const next = Math.max(0, Math.min(ids.length - 1, focus + delta));
  return blockSelection(blocks, current.anchorBlockId, ids[next]!);
}

/** Moves a whole-block selection to one adjacent visible block. */
export function adjacentBlockSelection(
  blocks: EditorBlock[],
  current: BlockSelection,
  direction: "up" | "down",
): BlockSelection {
  const ids = pageEntries(blocks).map(({ block }) => block.id);
  const edgeId = direction === "up" ? current.blockIds[0] : current.blockIds.at(-1);
  const index = edgeId ? ids.indexOf(edgeId) : -1;
  const next = index < 0 ? undefined : ids[index + (direction === "up" ? -1 : 1)];
  return next ? blockSelection(blocks, next) : current;
}

/** Roots moved by a drag or keyboard command. */
export interface SelectedMoveRoots {
  readonly ids: string[];
  readonly grouped: boolean;
  readonly selection?: BlockSelection;
}

/**
 * Resolves an eligible selected sibling group, otherwise the active block.
 * Selected descendants disappear from the root list because their ancestor
 * carries the complete subtree.
 */
export function selectedMoveRoots(
  blocks: EditorBlock[],
  selection: readonly { type: string }[],
  activeId: string,
): SelectedMoveRoots {
  const blockSelection = selection.find((item): item is BlockSelection => (
    item.type === "block" && "blockIds" in item && (item as BlockSelection).blockIds.includes(activeId)
  ));
  if (!blockSelection) return { ids: [activeId], grouped: false };

  const entries = pageEntries(blocks);
  const byId = new Map(entries.map((entry) => [entry.block.id, entry]));
  const selected = new Set(blockSelection.blockIds);
  const roots = entries.flatMap(({ block }) => {
    let parentId = byId.get(block.id)?.parentId;
    while (parentId) {
      if (selected.has(parentId)) return [];
      parentId = byId.get(parentId)?.parentId;
    }
    return selected.has(block.id) ? [block.id] : [];
  });
  const parentIds = new Set(roots.map((id) => byId.get(id)?.parentId));
  return roots.length > 1 && parentIds.size === 1
    ? { ids: roots, grouped: true, selection: blockSelection }
    : { ids: [activeId], grouped: false };
}

/** Concrete placement used by Alt+Shift+Up/Down. */
export interface KeyboardMovePlacement {
  readonly targetId: string;
  readonly position: "before" | "after";
}

/** Resolves Logseq-style sibling swapping and parent-boundary movement. */
export function keyboardMovePlacement(
  blocks: EditorBlock[],
  movedIds: string[],
  direction: "up" | "down",
): KeyboardMovePlacement | undefined {
  const entries = pageEntries(blocks);
  const byId = new Map(entries.map((entry) => [entry.block.id, entry]));
  const moved = new Set(movedIds);
  const roots = entries.filter(({ block }) => moved.has(block.id));
  const first = roots[0];
  const last = roots.at(-1);
  if (!first || !last || first.parentId !== last.parentId) return;
  const siblings = first.siblings;
  const firstIndex = siblings.findIndex((block) => block.id === first.block.id);
  const lastIndex = siblings.findIndex((block) => block.id === last.block.id);

  if (direction === "up") {
    const previous = siblings.slice(0, firstIndex).reverse().find((block) => !moved.has(block.id));
    if (previous) return { targetId: previous.id, position: "before" };
    return first.parentId ? { targetId: first.parentId, position: "before" } : undefined;
  }

  const next = siblings.slice(lastIndex + 1).find((block) => !moved.has(block.id));
  if (next) return { targetId: next.id, position: "after" };
  if (!last.parentId) return;
  const parent = byId.get(last.parentId);
  const parentIndex = parent?.siblings.findIndex((block) => block.id === last.parentId) ?? -1;
  return parent && parentIndex >= 0 && parentIndex < parent.siblings.length - 1
    ? { targetId: last.parentId, position: "after" }
    : undefined;
}
