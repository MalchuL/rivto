import type {
  BlockSelection,
  EditorPosition,
  EditorSelection,
  TextSelection,
} from "@chulane/rivto";
import { BLOCK_ID_ATTRIBUTE } from "../constants";
import {
  readEditorDOMSelection,
  restoreEditorDOMSelection,
} from "../events/utils/selection/editor-dom-selection";
import {
  useEditor,
  useEditorRoot,
  useKeyboardEvent,
} from "../hooks";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../events/keymap";
import {
  findNextEditableBlock,
  findPreviousEditableBlock,
  focusBlock,
  verticalCaretPosition,
} from "../events/utils/dom/block-dom";
import {
  adjacentBlockSelection,
  blockSelection,
  extendBlockSelection,
  keyboardMovePlacement,
  pageEntries,
  selectedMoveRoots,
} from "./utils/page-selection";

type VerticalDirection = "up" | "down";

function collapsed(selection: TextSelection): boolean {
  return selection.anchor.blockId === selection.head.blockId &&
    selection.anchor.offset === selection.head.offset;
}

function textSelectionEdge(
  editor: ReturnType<typeof useEditor>,
  selection: TextSelection,
  edge: "start" | "end",
): EditorPosition {
  const ids = pageEntries(editor.getBlocks()).map(({ block }) => block.id);
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
  root: HTMLElement,
  editor: ReturnType<typeof useEditor>,
): EditorSelection {
  const managed = editor.selection.get();
  // A click followed immediately by a key can precede `selectionchange`.
  return managed.length ? managed : readEditorDOMSelection(root) ?? [];
}

function setCaret(
  root: HTMLElement,
  editor: ReturnType<typeof useEditor>,
  position: EditorPosition,
): void {
  editor.execute("selection.set", {
    selection: [{ type: "text", anchor: position, head: position }],
  });
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
export function CaretNavigationPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  const movePlain = (direction: "left" | "right" | VerticalDirection): boolean => {
    if (!root) return false;
    const selection = currentSelection(root, editor);
    const text = selection.find((item): item is TextSelection => item.type === "text");
    if (!text) return false;
    if (!collapsed(text)) {
      const towardStart = direction === "left" || direction === "up";
      setCaret(root, editor, textSelectionEdge(editor, text, towardStart ? "start" : "end"));
      return true;
    }
    if (direction === "left" || direction === "right") {
      const block = editor.getBlock(text.head.blockId);
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

  const extendText = (direction: VerticalDirection): boolean => {
    if (!root) return false;
    const selection = currentSelection(root, editor);
    const text = selection.find((item): item is TextSelection => item.type === "text");
    if (!text) return false;
    const moved = verticalCaretPosition(root, text.head, direction);
    if (!moved) return false;
    if (moved.blockId !== text.anchor.blockId) {
      const next = blockSelection(editor.getBlocks(), text.anchor.blockId, moved.blockId);
      editor.execute("selection.set", { selection: [next] });
      focusBlockSelection(root, next.focusBlockId);
      return true;
    }
    const next: EditorSelection = [{ type: "text", anchor: text.anchor, head: moved }];
    editor.execute("selection.set", { selection: next });
    restoreEditorDOMSelection(root, next);
    return true;
  };

  const bindPlain = (
    id: string,
    direction: "left" | "right" | VerticalDirection,
  ) => useKeyboardEvent({
    id,
    keys: BUILTIN_KEYMAP[id],
    mode: "block",
  }, () => movePlain(direction));
  bindPlain(KEYBOARD_BINDING_IDS.caretLeft, "left");
  bindPlain(KEYBOARD_BINDING_IDS.caretRight, "right");
  bindPlain(KEYBOARD_BINDING_IDS.caretUp, "up");
  bindPlain(KEYBOARD_BINDING_IDS.caretDown, "down");

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.caretExtendUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendUp],
    mode: "block",
  }, () => extendText("up"));
  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.caretExtendDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.caretExtendDown],
    mode: "block",
  }, () => extendText("down"));

  return null;
}

/** Owns movement and directional growth of whole-block selections. */
export function BlockSelectionNavigationPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  const move = (direction: VerticalDirection, extend: boolean): boolean => {
    if (!root) return false;
    const blocks = currentSelection(root, editor)
      .find((item): item is BlockSelection => item.type === "block");
    if (!blocks) return false;
    const next = extend
      ? extendBlockSelection(editor.getBlocks(), blocks, direction)
      : adjacentBlockSelection(editor.getBlocks(), blocks, direction);
    editor.execute("selection.set", { selection: [next] });
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const grow = (direction: VerticalDirection): boolean => {
    if (!root) return false;
    const selection = currentSelection(root, editor);
    const blocks = selection.find((item): item is BlockSelection => item.type === "block");
    const text = selection.find((item): item is TextSelection => item.type === "text");
    const next = blocks
      ? extendBlockSelection(editor.getBlocks(), blocks, direction)
      : text ? blockSelection(editor.getBlocks(), text.head.blockId) : undefined;
    if (!next) return false;
    editor.execute("selection.set", { selection: [next] });
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const binding = (id: string, action: () => boolean) => useKeyboardEvent({
    id,
    keys: BUILTIN_KEYMAP[id],
    mode: "block",
  }, action);
  binding(KEYBOARD_BINDING_IDS.blockSelectionUp, () => move("up", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionDown, () => move("down", false));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendUp, () => move("up", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionExtendDown, () => move("down", true));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowUp, () => grow("up"));
  binding(KEYBOARD_BINDING_IDS.blockSelectionGrowDown, () => grow("down"));

  return null;
}

/** Moves the active block or eligible same-parent block selection structurally. */
export function KeyboardBlockMovePlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  const move = (direction: VerticalDirection): boolean => {
    if (!root) return false;
    const selection = currentSelection(root, editor);
    const text = selection.find((item): item is TextSelection => item.type === "text");
    const blocks = selection.find((item): item is BlockSelection => item.type === "block");
    const activeId = text?.head.blockId ?? blocks?.focusBlockId;
    if (!activeId) return false;
    const roots = selectedMoveRoots(editor.getBlocks(), selection, activeId);
    const placement = keyboardMovePlacement(editor.getBlocks(), roots.ids, direction);
    if (!placement) return false;
    editor.moveBlocks(roots.ids, placement.targetId, placement.position);
    if (roots.grouped && roots.selection) {
      editor.execute("selection.set", { selection: [roots.selection] });
    } else if (blocks) {
      editor.execute("selection.set", {
        selection: [blockSelection(editor.getBlocks(), activeId)],
      });
    }
    requestAnimationFrame(() => {
      if (text && !blocks) restoreEditorDOMSelection(root, selection);
      else focusBlockSelection(root, activeId);
    });
    return true;
  };

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.blockMoveUp,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveUp],
    mode: "block",
  }, () => move("up"));
  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.blockMoveDown,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockMoveDown],
    mode: "block",
  }, () => move("down"));

  return null;
}
