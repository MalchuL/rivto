import {
  BLOCK_ID_ATTRIBUTE,
  restoreEditorDOMSelection,
  readEditorDOMSelection,
  useEditor,
  useEditorEvent,
  useEditorRoot,
  type BlockSelection,
  type EditorPosition,
  type EditorSelection,
  type TextSelection,
} from "../internal";
import {
  findNextEditableBlock,
  findPreviousEditableBlock,
  focusBlock,
  verticalCaretPosition,
} from "./block-dom";
import {
  adjacentBlockSelection,
  blockSelection,
  extendBlockSelection,
  keyboardMovePlacement,
  pageEntries,
  selectedMoveRoots,
} from "./page-selection";

/** Returns whether a text selection is one caret. */
function collapsed(selection: TextSelection): boolean {
  return selection.anchor.blockId === selection.head.blockId && selection.anchor.offset === selection.head.offset;
}

/** Returns the document-ordered start or end of a directed text selection. */
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

/** Publishes and paints one text caret after delegated keyboard handling. */
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

/** Clears native text paint and focuses the page's block-selection owner. */
function focusBlockSelection(root: HTMLElement, blockId: string): void {
  root.ownerDocument.getSelection()?.removeAllRanges();
  root.focus({ preventScroll: true });
  root.querySelector<HTMLElement>(`[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(blockId)}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

/**
 * Implements the page demo's Logseq-style arrow keymap.
 *
 * Text movement uses DOM line geometry because soft wraps are absent from the
 * stored string. Once Shift or Alt enters whole-block mode, anchor/focus IDs
 * carry direction and the browser selection is deliberately cleared.
 */
export function PageArrowPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  useEditorEvent("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      !root ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) return;

    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    const direction = event.key === "ArrowUp" ? "up" : "down";
    // `selectionchange` may follow the keydown when the user clicks and presses
    // a shortcut immediately. Read the native caret as a synchronous fallback.
    const currentSelection = editor.selection.get();
    const selection = currentSelection.length ? currentSelection : readEditorDOMSelection(root) ?? [];
    const text = selection.find((item): item is TextSelection => item.type === "text");
    const blocks = selection.find((item): item is BlockSelection => item.type === "block");

    if (vertical && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      const activeId = text?.head.blockId ?? blocks?.focusBlockId;
      if (!activeId) return;
      const roots = selectedMoveRoots(editor.getBlocks(), selection, activeId);
      const placement = keyboardMovePlacement(editor.getBlocks(), roots.ids, direction);
      if (!placement) return;
      event.preventDefault();
      editor.moveBlocks(roots.ids, placement.targetId, placement.position);
      if (roots.grouped && roots.selection) editor.execute("selection.set", { selection: [roots.selection] });
      else if (blocks) editor.execute("selection.set", { selection: [blockSelection(editor.getBlocks(), activeId)] });
      requestAnimationFrame(() => {
        if (text && !blocks) restoreEditorDOMSelection(root, selection);
        else focusBlockSelection(root, activeId);
      });
      return;
    }

    if (vertical && event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const next = blocks
        ? extendBlockSelection(editor.getBlocks(), blocks, direction)
        : text ? blockSelection(editor.getBlocks(), text.head.blockId) : undefined;
      if (!next) return;
      editor.execute("selection.set", { selection: [next] });
      focusBlockSelection(root, next.focusBlockId);
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (text && !event.shiftKey && !collapsed(text)) {
      event.preventDefault();
      const towardStart = event.key === "ArrowLeft" || event.key === "ArrowUp";
      setCaret(root, editor, textSelectionEdge(editor, text, towardStart ? "start" : "end"));
      return;
    }

    if (vertical && blocks) {
      event.preventDefault();
      const next = event.shiftKey
        ? extendBlockSelection(editor.getBlocks(), blocks, direction)
        : adjacentBlockSelection(editor.getBlocks(), blocks, direction);
      editor.execute("selection.set", { selection: [next] });
      focusBlockSelection(root, next.focusBlockId);
      return;
    }

    if (!text) return;
    if (!vertical) {
      if (event.shiftKey || !collapsed(text)) return;
      const block = editor.getBlock(text.head.blockId);
      const previous = event.key === "ArrowLeft" && text.head.offset === 0
        ? findPreviousEditableBlock(root, text.head.blockId)
        : null;
      const next = event.key === "ArrowRight" && text.head.offset === (block?.content.length ?? -1)
        ? findNextEditableBlock(root, text.head.blockId)
        : null;
      const target = previous
        ? { blockId: previous.blockId, offset: previous.content.textContent?.length ?? 0 }
        : next ? { blockId: next.blockId, offset: 0 } : undefined;
      if (!target) return;
      event.preventDefault();
      setCaret(root, editor, target);
      return;
    }

    const moved = verticalCaretPosition(root, text.head, direction);
    if (!moved) return;
    event.preventDefault();
    if (event.shiftKey && moved.blockId !== text.anchor.blockId) {
      const next = blockSelection(editor.getBlocks(), text.anchor.blockId, moved.blockId);
      editor.execute("selection.set", { selection: [next] });
      focusBlockSelection(root, next.focusBlockId);
      return;
    }
    if (event.shiftKey) {
      const next: EditorSelection = [{ type: "text", anchor: text.anchor, head: moved }];
      editor.execute("selection.set", { selection: next });
      restoreEditorDOMSelection(root, next);
      return;
    }
    setCaret(root, editor, moved);
  });

  return null;
}
