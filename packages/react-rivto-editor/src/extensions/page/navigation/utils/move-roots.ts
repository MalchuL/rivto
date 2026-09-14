/**
 * Resolves the structural roots moved by block drag and keyboard commands.
 *
 * @module
 */
import {
  getSelectedBlockIds,
  hasBlockRanges,
  isStructuralSelection,
  type EditorBlock as Block,
  type Selection,
} from "@chulane/rivto";
import { neverCollapsed, pageEntries } from "./outline";
import type { IsCollapsedBlock, SelectedMoveRoots } from "./types";

export type { SelectedMoveRoots } from "./types";

/**
 * Resolves an eligible selected sibling group, otherwise the active block.
 *
 * @param blocks - Complete outline roots.
 * @param selection - Current portable selection.
 * @param activeId - Block whose move gesture was activated.
 * @param isCollapsed - Host collapse policy.
 * @returns Stable roots and grouped-selection metadata.
 */
export function selectedMoveRoots(
  blocks: Block[],
  selection: Selection | undefined,
  activeId: string,
  isCollapsed: IsCollapsedBlock = neverCollapsed,
): SelectedMoveRoots {
  const structuralSelection = selection && hasBlockRanges(selection)
    && isStructuralSelection(selection) && getSelectedBlockIds(selection).includes(activeId)
    ? selection : undefined;
  let result: SelectedMoveRoots = { ids: [activeId], grouped: false };
  if (structuralSelection) {
    const entries = pageEntries(blocks, null, false, isCollapsed);
    const byId = new Map(entries.map((entry) => [entry.block.id, entry]));
    const selected = new Set(getSelectedBlockIds(structuralSelection));
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
      result = { ids: roots, grouped: true, selection: structuralSelection };
    }
  }
  return result;
}
