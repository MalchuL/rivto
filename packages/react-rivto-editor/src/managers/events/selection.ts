/**
 * Provides shared conversion and focus helpers for keyboard commands that act
 * on Rivto's portable selection while respecting the browser's latest native
 * caret, including clicks dispatched before `selectionchange` synchronization.
 *
 * @module
 */
import type {
  RivtoEditorApi as Editor,
  Selection,
} from "@chulane/rivto";
import { createCaretSelection, isCaretSelection } from "@chulane/rivto";
import type { SelectionCapability } from "../../capabilities";
import {
  findBlockFromEvent,
  focusBlock,
} from "./block-dom";

/** One block target resolved from the current selection for a keyboard command. */
export interface KeyboardSelectionTarget {
  /** Original selection; commands may branch on structural versus partial coverage. */
  readonly item: Selection;
  /** First block addressed by that item. */
  readonly blockId: string;
  /** Caret offset when the item is a collapsed selection. */
  readonly offset?: number;
  /** Whether this item represents one zero-length caret. */
  readonly collapsed: boolean;
}

/**
 * Resolves the first covered block for single-target keyboard behavior.
 *
 * Enter intentionally creates one block after this target rather than creating
 * a block for every selected item. Indent and outdent read the full item from
 * this target and pass those IDs explicitly to the block manager.
 */
export function firstKeyboardTarget(
  selection: Selection | undefined,
): KeyboardSelectionTarget | undefined {
  const item = selection;
  const blockId = item?.blocks[0]?.id;
  if (!item || !blockId) return;
  const collapsed = isCaretSelection(item);
  return {
    item,
    blockId,
    offset: collapsed ? item.blocks[0]!.start : undefined,
    collapsed,
  };
}

/** Returns true when the complete editor selection is not one collapsed caret. */
export function shouldDeleteSelection(
  selection: Selection | undefined,
): boolean {
  return Boolean(selection && !firstKeyboardTarget(selection)?.collapsed);
}

/**
 * Resolves keyboard state from a live native caret before portable state.
 *
 * Chromium may dispatch a key immediately after click and before its delayed
 * `selectionchange`. Preferring a readable DOM selection prevents that key from
 * acting on the previously focused block while retaining portable structural
 * selection when no native range exists.
 *
 * @param selectionManager - React selection bridge that reads the active DOM range.
 * @param editor - Core editor whose portable selection is synchronized when needed.
 * @param emptyBlockId - Editable event target used when an empty host has no DOM range.
 * @returns Current selection suitable for a keyboard command.
 */
export function readKeyboardSelection(
  selectionManager: SelectionCapability,
  editor: Editor,
  emptyBlockId?: string,
): Selection | undefined {
  const nativeSelection = selectionManager.readDOM();
  const emptyBlock = emptyBlockId ? editor.blocks.getBlock(emptyBlockId) : undefined;
  const focusedEmptySelection: Selection | undefined = !nativeSelection && emptyBlock?.content === ""
    ? createCaretSelection(emptyBlock.id, 0)
    : undefined;
  const current = nativeSelection ?? focusedEmptySelection;
  if (current) selectionManager.set(current);
  return current ?? selectionManager.get();
}

export function isEditableKeyboardEvent(event: Event): boolean {
  return Boolean(findBlockFromEvent(event));
}

/** Restores the native caret represented by current editor selection state. */
export function focusSelectionCaret(
  root: HTMLElement,
  selectionManager: SelectionCapability,
): boolean {
  const target = firstKeyboardTarget(selectionManager.get());
  return Boolean(target?.collapsed && focusBlock(root, target.blockId, target.offset ?? 0));
}
