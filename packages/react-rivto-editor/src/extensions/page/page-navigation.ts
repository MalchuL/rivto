import type {
  BlockSelection,
  RivtoEditorApi as Editor,
  EditorPosition,
  EditorSelection,
  TextSelection,
} from "@chulane/rivto";
import { BLOCK_ID_ATTRIBUTE } from "../../constants";
import type { ReactEditor } from "../../types";
import {
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
} from "../../managers";
import type { SelectionCapability } from "../../capabilities";
import {
  findNextEditableBlock,
  findPreviousEditableBlock,
  focusBlock,
  verticalCaretPosition,
} from "../../managers";
import {
  adjacentBlockSelection,
  blockSelection,
  extendBlockSelection,
  keyboardMovePlacement,
  pageEntries,
  selectedMoveRoots,
} from "./page-selection-utils";

type VerticalDirection = "up" | "down";

function collapsed(selection: TextSelection): boolean {
  return selection.anchor.blockId === selection.head.blockId &&
    selection.anchor.offset === selection.head.offset;
}

function textSelectionEdge(
  editor: Editor,
  selection: TextSelection,
  edge: "start" | "end",
): EditorPosition {
  const ids = pageEntries(editor.blocks.getBlocks()).map(({ block }) => block.id);
  const anchorIndex = ids.indexOf(selection.anchor.blockId);
  const headIndex = ids.indexOf(selection.head.blockId);
  const forward = anchorIndex < headIndex || (
    anchorIndex === headIndex && selection.anchor.offset <= selection.head.offset
  );
  const start = forward ? selection.anchor : selection.head;
  const end = forward ? selection.head : selection.anchor;
  return edge === "start" ? start : end;
}

function currentSelection(
  selectionManager: SelectionCapability,
  editor: Editor,
): EditorSelection {
  const managed = editor.selection.get();
  // A click followed immediately by a key can precede `selectionchange`.
  return managed.length ? managed : selectionManager.readDOM() ?? [];
}

function setCaret(
  root: HTMLElement,
  editor: Editor,
  position: EditorPosition,
): void {
  editor.selection.set([{ type: "text", anchor: position, head: position }]);
  focusBlock(root, position.blockId, position.offset);
}

function focusBlockSelection(root: HTMLElement, blockId: string): void {
  root.ownerDocument.getSelection()?.removeAllRanges();
  root.focus({ preventScroll: true });
  root.querySelector<HTMLElement>(`[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(blockId)}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

/**
 * Owns native-looking caret movement, including wrapped-line geometry.
 *
 * Each shortcut is a separate declarative binding. Structural block selection
 * is intentionally absent, allowing an unclaimed key to fall through to
 * `BlockSelectionNavigationPlugin`.
 */
export function registerCaretNavigation(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const movePlain = (root: HTMLElement, direction: "left" | "right" | VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection, editor);
    const text = selection.find((item): item is TextSelection => item.type === "text");
    if (!text) return false;
    if (!collapsed(text)) {
      const towardStart = direction === "left" || direction === "up";
      setCaret(root, editor, textSelectionEdge(editor, text, towardStart ? "start" : "end"));
      return true;
    }
    if (direction === "left" || direction === "right") {
      const block = editor.blocks.getBlock(text.head.blockId);
      const adjacent = direction === "left" && text.head.offset === 0
        ? findPreviousEditableBlock(root, text.head.blockId)
        : direction === "right" && text.head.offset === (block?.content.length ?? -1)
          ? findNextEditableBlock(root, text.head.blockId)
          : null;
      if (!adjacent) return false;
      setCaret(root, editor, {
        blockId: adjacent.blockId,
        offset: direction === "left" ? adjacent.content.textContent?.length ?? 0 : 0,
      });
      return true;
    }
    const moved = verticalCaretPosition(root, text.head, direction);
    if (!moved) return false;
    setCaret(root, editor, moved);
    return true;
  };

  const extendText = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection, editor);
    const text = selection.find((item): item is TextSelection => item.type === "text");
    if (!text) return false;
    const moved = verticalCaretPosition(root, text.head, direction);
    if (!moved) return false;
    if (moved.blockId !== text.anchor.blockId) {
      const next = blockSelection(editor.blocks.getBlocks(), text.anchor.blockId, moved.blockId);
      editor.selection.set([next]);
      focusBlockSelection(root, next.focusBlockId);
      return true;
    }
    const next: EditorSelection = [{ type: "text", anchor: text.anchor, head: moved }];
    editor.selection.set(next);
    reactEditor.selection.restoreDOM(next);
    return true;
  };

  const bindPlain = (
    id: string,
    direction: "left" | "right" | VerticalDirection,
  ) => reactEditor.keyboard.register({
    id,
    keys: BUILTIN_KEYMAP[id],
    mode: "block",
  }, ({ root }) => movePlain(root, direction));
  bindPlain(KEYBOARD_BINDING_IDS.caretLeft, "left");
  bindPlain(KEYBOARD_BINDING_IDS.caretRight, "right");
  bindPlain(KEYBOARD_BINDING_IDS.caretUp, "up");
  bindPlain(KEYBOARD_BINDING_IDS.caretDown, "down");

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.caretExtendUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendUp],
    mode: "block",
  }, ({ root }) => extendText(root, "up"));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.caretExtendDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendDown],
    mode: "block",
  }, ({ root }) => extendText(root, "down"));
}

/** Owns movement and directional growth of whole-block selections. */
export function registerBlockSelectionNavigation(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const move = (root: HTMLElement, direction: VerticalDirection, extend: boolean): boolean => {
    const blocks = currentSelection(reactEditor.selection, editor)
      .find((item): item is BlockSelection => item.type === "block");
    if (!blocks) return false;
    const next = extend
      ? extendBlockSelection(editor.blocks.getBlocks(), blocks, direction)
      : adjacentBlockSelection(editor.blocks.getBlocks(), blocks, direction);
    editor.selection.set([next]);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const grow = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection, editor);
    const blocks = selection.find((item): item is BlockSelection => item.type === "block");
    const text = selection.find((item): item is TextSelection => item.type === "text");
    const next = blocks
      ? extendBlockSelection(editor.blocks.getBlocks(), blocks, direction)
      : text ? blockSelection(editor.blocks.getBlocks(), text.head.blockId) : undefined;
    if (!next) return false;
    editor.selection.set([next]);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  /** Enters a caret at offset 0 on the focus block. Left and right are one-way. */
  const enterText = (root: HTMLElement): boolean => {
    const blocks = currentSelection(reactEditor.selection, editor)
      .find((item): item is BlockSelection => item.type === "block");
    if (!blocks) return false;
    setCaret(root, editor, { blockId: blocks.focusBlockId, offset: 0 });
    return true;
  };

  const binding = (
    id: string,
    action: (root: HTMLElement) => boolean,
  ) => reactEditor.keyboard.register({
    id,
    keys: BUILTIN_KEYMAP[id],
    mode: "block",
  }, ({ root }) => action(root));
  binding(KEYBOARD_BINDING_IDS.blockSelectionUp, (root) => move(root, "up", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionDown, (root) => move(root, "down", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendUp, (root) => move(root, "up", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendDown, (root) => move(root, "down", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowUp, (root) => grow(root, "up"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowDown, (root) => grow(root, "down"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretLeft, enterText);
  binding(KEYBOARD_BINDING_IDS.blockSelectionCaretRight, enterText);
}

/** Moves the active block or eligible same-parent block selection structurally. */
export function registerKeyboardBlockMove(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const move = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection, editor);
    const text = selection.find((item): item is TextSelection => item.type === "text");
    const blocks = selection.find((item): item is BlockSelection => item.type === "block");
    const activeId = text?.head.blockId ?? blocks?.focusBlockId;
    if (!activeId) return false;
    const roots = selectedMoveRoots(editor.blocks.getBlocks(), selection, activeId);
    const placement = keyboardMovePlacement(editor.blocks.getBlocks(), roots.ids, direction);
    if (!placement) return false;
    editor.blocks.moveBlocks(roots.ids, placement.targetId, placement.position);
    if (roots.grouped && roots.selection) {
      editor.selection.set([roots.selection]);
    } else if (blocks) {
      editor.selection.set([blockSelection(editor.blocks.getBlocks(), activeId)]);
    }
    requestAnimationFrame(() => {
      if (text && !blocks) reactEditor.selection.restoreDOM(selection);
      else focusBlockSelection(root, activeId);
    });
    return true;
  };

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMoveUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveUp],
    mode: "block",
  }, ({ root }) => move(root, "up"));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMoveDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveDown],
    mode: "block",
  }, ({ root }) => move(root, "down"));
}
