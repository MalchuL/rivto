/**
 * Provides shared conversion and focus helpers for keyboard commands that act
 * on Rivto's portable selection while respecting the browser's latest native
 * caret, including clicks dispatched before `selectionchange` synchronization.
 *
 * @module
 */
import type {
  RivtoEditorApi as Editor,
  EditorSelection,
  EditorSelectionItem,
} from "@chulane/rivto";
import type { SelectionCapability } from "../../capabilities";
import {
  findBlockFromEvent,
  focusBlock,
} from "./block-dom";

/** First selection item resolved to one page block for a keyboard command. */
export interface KeyboardSelectionTarget {
  /** Original selection item; commands may branch on text versus whole blocks. */
  readonly item: EditorSelectionItem;
  /** First block addressed by that item. */
  readonly blockId: string;
  /** Caret offset when the item is a collapsed text selection. */
  readonly offset?: number;
  /** Whether this item represents one zero-length text caret. */
  readonly collapsed: boolean;
}

/**
 * Resolves only the first selection item for single-target keyboard behavior.
 *
 * Enter intentionally creates one block after this target rather than creating
 * a block for every selected item. Structural commands such as indent use this
 * target only as an entry point; the runtime expands it to the full selection.
 */
export function firstKeyboardTarget(selection: EditorSelection): KeyboardSelectionTarget | undefined {
  const item = selection[0];
  if (!item) return;
  if (item.type === "text") {
    const collapsed = item.anchor.blockId === item.head.blockId && item.anchor.offset === item.head.offset;
    return {
      item,
      blockId: item.anchor.blockId,
      offset: collapsed ? item.anchor.offset : undefined,
      collapsed,
    };
  }
  const blockId = item.blockIds[0];
  return blockId ? { item, blockId, collapsed: false } : undefined;
}

/** Returns true when the complete editor selection is not one collapsed caret. */
export function shouldDeleteSelection(selection: EditorSelection): boolean {
  return selection.length !== 1 || !firstKeyboardTarget(selection)?.collapsed;
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
): EditorSelection {
  const nativeSelection = selectionManager.readDOM();
  const emptyBlock = emptyBlockId ? editor.blocks.getBlock(emptyBlockId) : undefined;
  const focusedEmptySelection: EditorSelection | undefined = !nativeSelection && emptyBlock?.content === ""
    ? [{
        type: "text",
        anchor: { blockId: emptyBlock.id, offset: 0 },
        head: { blockId: emptyBlock.id, offset: 0 },
      }]
    : undefined;
  const current = nativeSelection ?? focusedEmptySelection;
  if (current) editor.selection.set(current);
  return current ?? editor.selection.get();
}

/** Uses the event target only to scope shortcuts to editable page content. */
export function isEditableKeyboardEvent(event: Event): boolean {
  return Boolean(findBlockFromEvent(event));
}

/** Restores the native caret represented by current editor selection state. */
export function focusSelectionCaret(root: HTMLElement, editor: Editor): boolean {
  const target = firstKeyboardTarget(editor.selection.get());
  return Boolean(target?.collapsed && focusBlock(root, target.blockId, target.offset ?? 0));
}
