import type {
  BlockSelection,
  RivtoEditorApi as Editor,
  EditorPosition,
  EditorSelection,
  TextSelection,
} from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  PAGE_EDITOR_ROOT_SELECTOR,
} from "../../constants";
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
import { navigationDomRoot, navigationOutlineBlocks } from "./outline-scope";

type VerticalDirection = "up" | "down";

/** Native controls own arrow keys even when the editor retains a text selection. */
function isNativeControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName);
}

function collapsed(selection: TextSelection): boolean {
  return selection.anchor.blockId === selection.head.blockId &&
    selection.anchor.offset === selection.head.offset;
}

function textSelectionEdge(
  editor: Editor,
  selection: TextSelection,
  edge: "start" | "end",
): EditorPosition {
  const ids = pageEntries(navigationOutlineBlocks(editor, selection.head.blockId))
    .map(({ block }) => block.id);
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

/** Moves a boundary caret to the adjacent page editor in DOM order. */
function focusAdjacentEditor(root: HTMLElement, direction: VerticalDirection): boolean {
  const roots = Array.from(root.ownerDocument.querySelectorAll<HTMLElement>(PAGE_EDITOR_ROOT_SELECTOR));
  const index = roots.indexOf(root);
  const adjacent = roots[index + (direction === "up" ? -1 : 1)];
  if (!adjacent) return false;
  const blocks = Array.from(adjacent.querySelectorAll<HTMLElement>(BLOCK_ID_SELECTOR));
  if (direction === "up") blocks.reverse();
  for (const block of blocks) {
    const content = Array.from(block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR))
      .find((candidate) => candidate.closest(BLOCK_ID_SELECTOR) === block);
    const blockId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (blockId && content) {
      return focusBlock(adjacent, blockId, direction === "up" ? content.textContent?.length ?? 0 : 0);
    }
  }
  return false;
}

function focusBlockSelection(root: HTMLElement, blockId: string): void {
  root.ownerDocument.getSelection()?.removeAllRanges();
  root.focus({ preventScroll: true });
  root.querySelector<HTMLElement>(`[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(blockId)}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

function activeBlockId(selection: EditorSelection): string | undefined {
  const text = selection.find((item): item is TextSelection => item.type === "text");
  const blocks = selection.find((item): item is BlockSelection => item.type === "block");
  return text?.head.blockId ?? blocks?.focusBlockId;
}

/**
 * Owns native-looking caret movement, including wrapped-line geometry.
 *
 * Each shortcut is a separate declarative binding. Structural block selection
 * is intentionally absent, allowing an unclaimed key to fall through to
 * `BlockSelectionNavigationPlugin`. Edgeless keeps walks inside the active card.
 */
export function registerCaretNavigation(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const movePlain = (root: HTMLElement, direction: "left" | "right" | VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection, editor);
    const text = selection.find((item): item is TextSelection => item.type === "text");
    if (!text) return false;
    const scope = navigationDomRoot(root, text.head.blockId);
    if (!collapsed(text)) {
      const towardStart = direction === "left" || direction === "up";
      setCaret(root, editor, textSelectionEdge(editor, text, towardStart ? "start" : "end"));
      return true;
    }
    if (direction === "left" || direction === "right") {
      const block = editor.blocks.getBlock(text.head.blockId);
      const adjacent = direction === "left" && text.head.offset === 0
        ? findPreviousEditableBlock(scope, text.head.blockId)
        : direction === "right" && text.head.offset === (block?.content.length ?? -1)
          ? findNextEditableBlock(scope, text.head.blockId)
          : null;
      if (!adjacent) return false;
      setCaret(root, editor, {
        blockId: adjacent.blockId,
        offset: direction === "left" ? adjacent.content.textContent?.length ?? 0 : 0,
      });
      return true;
    }
    const moved = verticalCaretPosition(scope, text.head, direction);
    if (!moved) {
      return editor.mode.get() === "block" && focusAdjacentEditor(root, direction);
    }
    setCaret(root, editor, moved);
    return true;
  };

  const extendText = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection, editor);
    const text = selection.find((item): item is TextSelection => item.type === "text");
    if (!text) return false;
    const scope = navigationDomRoot(root, text.head.blockId);
    const outline = navigationOutlineBlocks(editor, text.head.blockId);
    const moved = verticalCaretPosition(scope, text.head, direction);
    if (!moved) return false;
    if (moved.blockId !== text.anchor.blockId) {
      const next = blockSelection(outline, text.anchor.blockId, moved.blockId);
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
  }, ({ root, raw }) => !isNativeControl(raw.target) && movePlain(root, direction));
  bindPlain(KEYBOARD_BINDING_IDS.caretLeft, "left");
  bindPlain(KEYBOARD_BINDING_IDS.caretRight, "right");
  bindPlain(KEYBOARD_BINDING_IDS.caretUp, "up");
  bindPlain(KEYBOARD_BINDING_IDS.caretDown, "down");

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.caretExtendUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendUp],
  }, ({ root, raw }) => !isNativeControl(raw.target) && extendText(root, "up"));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.caretExtendDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendDown],
  }, ({ root, raw }) => !isNativeControl(raw.target) && extendText(root, "down"));
}

/** Owns movement and directional growth of whole-block selections. */
export function registerBlockSelectionNavigation(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const move = (root: HTMLElement, direction: VerticalDirection, extend: boolean): boolean => {
    const blocks = currentSelection(reactEditor.selection, editor)
      .find((item): item is BlockSelection => item.type === "block");
    if (!blocks) return false;
    const outline = navigationOutlineBlocks(editor, blocks.focusBlockId);
    const next = extend
      ? extendBlockSelection(outline, blocks, direction)
      : adjacentBlockSelection(outline, blocks, direction);
    editor.selection.set([next]);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const grow = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection, editor);
    const blocks = selection.find((item): item is BlockSelection => item.type === "block");
    const text = selection.find((item): item is TextSelection => item.type === "text");
    const anchorId = blocks?.focusBlockId ?? text?.head.blockId;
    if (!anchorId) return false;
    const outline = navigationOutlineBlocks(editor, anchorId);
    const next = blocks
      ? extendBlockSelection(outline, blocks, direction)
      : text ? blockSelection(outline, text.head.blockId) : undefined;
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
    const activeId = activeBlockId(selection);
    if (!activeId) return false;
    const outline = navigationOutlineBlocks(editor, activeId);
    const roots = selectedMoveRoots(outline, selection, activeId);
    const placement = keyboardMovePlacement(outline, roots.ids, direction);
    if (!placement) return false;
    editor.blocks.moveBlocks(roots.ids, placement.targetId, placement.position);
    if (roots.grouped && roots.selection) {
      editor.selection.set([roots.selection]);
    } else if (blocks) {
      editor.selection.set([blockSelection(outline, activeId)]);
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
  }, ({ root }) => move(root, "up"));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockMoveDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveDown],
  }, ({ root }) => move(root, "down"));
}
