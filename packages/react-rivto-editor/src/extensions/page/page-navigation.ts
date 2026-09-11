/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import type {
  EditorBlock,
  RivtoEditorApi as Editor,
  EditorPosition,
  Selection,
} from "@chulane/rivto";
import {
  assertBlockRangeEndpoints,
  createCaretSelection,
  hasBlockRanges,
  isCaretSelection,
  isStructuralSelection,
  createTextSelection,
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
  resolveSelectionEndpoints,
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

function collapsed(item: Selection): boolean {
  return isCaretSelection(item);
}

function textSelectionEdge(
  reactEditor: ReactEditor,
  editor: Editor,
  selection: Selection,
  edge: "start" | "end",
): EditorPosition {
  assertBlockRangeEndpoints(selection);
  const lengthOf = (id: string) => editor.blocks.getBlock(id)?.content.length ?? 0;
  const ends = resolveSelectionEndpoints(selection, lengthOf);
  if (!ends) return { blockId: selection.focusBlockId, offset: 0 };
  const ids = pageEntries(
    navigationOutlineBlocks(editor, selection.focusBlockId),
    null,
    false,
    (block) => reactEditor.blocks.hasListProps("collapse") && block.listProps.collapsed === true,
  ).map(({ block }) => block.id);
  const anchorIndex = ids.indexOf(ends.anchor.blockId);
  const headIndex = ids.indexOf(ends.head.blockId);
  const forward = anchorIndex < headIndex || (
    anchorIndex === headIndex && ends.anchor.offset <= ends.head.offset
  );
  const start = forward ? ends.anchor : ends.head;
  const stop = forward ? ends.head : ends.anchor;
  return edge === "start" ? start : stop;
}

function currentSelection(
  selectionManager: SelectionCapability,
): Selection | undefined {
  // A click followed immediately by a key can precede `selectionchange`.
  // Prefer its live caret over stale plugin-only state with `blocks: []`;
  // structural selection has no DOM range and therefore still uses the store.
  return selectionManager.readDOM() ?? selectionManager.get();
}

function setCaret(
  root: HTMLElement,
  reactEditor: ReactEditor,
  position: EditorPosition,
): void {
  reactEditor.selection.set(createCaretSelection(position.blockId, position.offset));
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
  let focused = false;
  for (const block of blocks) {
    const content = Array.from(block.querySelectorAll<HTMLElement>(BLOCK_CONTENT_SELECTOR))
      .find((candidate) => candidate.closest(BLOCK_ID_SELECTOR) === block);
    const blockId = block.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (blockId && content) {
      focused = focusBlock(adjacent, blockId, direction === "up" ? content.textContent?.length ?? 0 : 0);
      break;
    }
  }
  return focused;
}

function focusBlockSelection(root: HTMLElement, blockId: string): void {
  root.ownerDocument.getSelection()?.removeAllRanges();
  root.focus({ preventScroll: true });
  root.querySelector<HTMLElement>(`[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(blockId)}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

function activeBlockId(selection: Selection | undefined): string | undefined {
  return selection?.focusBlockId;
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
  const lengthOf = (id: string) => editor.blocks.getBlock(id)?.content.length ?? 0;
  const movePlain = (root: HTMLElement, direction: "left" | "right" | VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item) || isStructuralSelection(selection)) return false;
    const ends = resolveSelectionEndpoints(item, lengthOf);
    if (!ends) return false;
    const scope = navigationDomRoot(root, ends.head.blockId);
    let handled = false;
    if (!collapsed(item)) {
      const towardStart = direction === "left" || direction === "up";
      setCaret(root, reactEditor, textSelectionEdge(reactEditor, editor, item, towardStart ? "start" : "end"));
      handled = true;
    } else if (direction === "left" || direction === "right") {
      const block = editor.blocks.getBlock(ends.head.blockId);
      const adjacent = direction === "left" && ends.head.offset === 0
        ? findPreviousEditableBlock(scope, ends.head.blockId)
        : direction === "right" && ends.head.offset === (block?.content.length ?? -1)
          ? findNextEditableBlock(scope, ends.head.blockId)
          : null;
      if (adjacent) {
        setCaret(root, reactEditor, {
          blockId: adjacent.blockId,
          offset: direction === "left" ? adjacent.content.textContent?.length ?? 0 : 0,
        });
        handled = true;
      }
    } else {
      const moved = verticalCaretPosition(scope, ends.head, direction);
      if (moved) {
        setCaret(root, reactEditor, moved);
        handled = true;
      } else {
        handled = editor.mode.get() === "block" && focusAdjacentEditor(root, direction);
      }
    }
    return handled;
  };

  /**
   * Extends the active text head along visual lines, keeping per-block offsets.
   * @param root - Surface root used to restore native endpoints.
   * @param direction - Vertical visual-line direction.
   * @returns Whether a new range was published.
   */
  const extendText = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item) || isStructuralSelection(selection)) return false;
    const ends = resolveSelectionEndpoints(item, lengthOf);
    if (!ends) return false;
    const scope = navigationDomRoot(root, ends.head.blockId);
    const moved = verticalCaretPosition(scope, ends.head, direction);
    if (!moved) return false;
    const outline = pageEntries(navigationOutlineBlocks(editor, ends.head.blockId)).map(({ block }) => ({
      id: block.id,
      length: block.content.length,
    }));
    const next = createTextSelection(outline, ends.anchor, moved);
    if (!next) return false;
    reactEditor.selection.set(next);
    reactEditor.selection.restoreDOM();
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
  const isCollapsed = (block: EditorBlock) => (
    reactEditor.blocks.hasListProps("collapse") && block.listProps.collapsed === true
  );
  const move = (root: HTMLElement, direction: VerticalDirection, extend: boolean): boolean => {
    const selection = currentSelection(reactEditor.selection);
    if (!isStructuralSelection(selection)) return false;
    const item = selection;
    if (!item || !hasBlockRanges(item)) return false;
    const outline = navigationOutlineBlocks(editor, item.focusBlockId);
    const next = extend
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : adjacentBlockSelection(outline, item, direction, isCollapsed);
    assertBlockRangeEndpoints(next);
    reactEditor.selection.set(next);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  const grow = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection);
    const item = selection;
    if (!item || !hasBlockRanges(item)) return false;
    const outline = navigationOutlineBlocks(editor, item.focusBlockId);
    const next = isStructuralSelection(selection)
      ? extendBlockSelection(outline, item, direction, isCollapsed)
      : blockSelection(outline, item.focusBlockId, item.focusBlockId, isCollapsed);
    if (!next) return false;
    assertBlockRangeEndpoints(next);
    reactEditor.selection.set(next);
    focusBlockSelection(root, next.focusBlockId);
    return true;
  };

  /** Enters a caret at offset 0 on the focus block. Left and right are one-way. */
  const enterText = (root: HTMLElement): boolean => {
    const blocks = currentSelection(reactEditor.selection);
    if (!blocks || !hasBlockRanges(blocks)) return false;
    setCaret(root, reactEditor, { blockId: blocks.focusBlockId, offset: 0 });
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
  const isCollapsed = (block: EditorBlock) => (
    reactEditor.blocks.hasListProps("collapse") && block.listProps.collapsed === true
  );
  const move = (root: HTMLElement, direction: VerticalDirection): boolean => {
    const selection = currentSelection(reactEditor.selection);
    const blocks = selection;
    const textLike = blocks && !isStructuralSelection(selection);
    const activeId = activeBlockId(selection);
    if (!activeId) return false;
    const outline = navigationOutlineBlocks(editor, activeId);
    const roots = selectedMoveRoots(outline, selection, activeId, isCollapsed);
    const placement = keyboardMovePlacement(outline, roots.ids, direction, isCollapsed);
    if (!placement) return false;
    editor.blocks.moveBlocks(roots.ids, placement.targetId, placement.position);
    if (roots.grouped && roots.selection) {
      reactEditor.selection.set(roots.selection);
    } else if (blocks) {
      reactEditor.selection.set(blockSelection(outline, activeId, activeId, isCollapsed));
    }
    requestAnimationFrame(() => {
      if (textLike) reactEditor.selection.restoreDOM(selection);
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
