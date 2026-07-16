import { Fragment, createElement, type PropsWithChildren } from "react";
import type { EditorBlock, EditorBlockInput } from "../../../editor/model";
import { RIVTO_BLOCK_ATTR, RIVTO_BLOCK_CONTENT_ATTR } from "../blocks/dom";
import { useEditor, useEditorEvent, useEditorRoot } from "../editor/context";
import { readEditorSelection, restoreEditorSelection } from "../selection";
import type { ViewPlugin } from "../editor/types";

const LIST_TYPES = new Set(["bulletListItem", "numberedListItem", "checkListItem"]);

function flatten(blocks: EditorBlock[]): EditorBlock[] {
  return blocks.flatMap((block) => [block, ...flatten(block.children)]);
}

function KeyboardView({ children, defaultBlockType }: PropsWithChildren<{ defaultBlockType: string }>) {
  const editor = useEditor();
  const root = useEditorRoot();
  const focus = (blockId: string, offset: number): void => {
    const selection = { type: "text" as const, anchor: { blockId, offset }, head: { blockId, offset } };
    editor.execute("selection.set", { selection });
    requestAnimationFrame(() => root.current && restoreEditorSelection(root.current, selection));
  };

  useEditorEvent("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || !root.current) return;
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`)
      : null;
    const shell = target?.closest<HTMLElement>(`[${RIVTO_BLOCK_ATTR}]`);
    const id = shell?.getAttribute(RIVTO_BLOCK_ATTR);
    const block = id ? editor.getBlock(id) : undefined;
    const blocks = flatten(editor.getBlocks());
    const index = id ? blocks.findIndex((item) => item.id === id) : -1;
    const selection = readEditorSelection(root.current);

    if (event.key === "Tab") {
      const selectedId = editor.selection.get()?.type === "block"
        ? (editor.selection.get() as Extract<ReturnType<typeof editor.selection.get>, { type: "block" }>).focusBlockId
        : id;
      if (!selectedId) return;
      event.preventDefault();
      editor.execute(event.shiftKey ? "block.outdent" : "block.indent", { id: selectedId });
      return;
    }
    if (!block || !selection || selection.type !== "text" || event.metaKey || event.ctrlKey) return;
    const forward = selection.anchor.blockId === id ? selection.anchor.offset : selection.head.offset;
    const collapsed = selection.anchor.blockId === selection.head.blockId && selection.anchor.offset === selection.head.offset;

    if (event.key === "Enter" && !event.shiftKey && collapsed) {
      event.preventDefault();
      const nextType = LIST_TYPES.has(block.type) ? block.type : defaultBlockType;
      editor.updateBlock(id!, { content: block.content.slice(0, forward) });
      const input: EditorBlockInput = { type: nextType, content: block.content.slice(forward) };
      const nextId = editor.insertBlock(input, id);
      focus(nextId, 0);
      return;
    }
    if (event.key === "Backspace" && collapsed && forward === 0) {
      event.preventDefault();
      const previous = blocks[index - 1];
      const next = blocks[index + 1];
      if (!previous && !next) {
        if (block.content) return;
        editor.updateBlock(id!, { content: "" });
        focus(id!, 0);
        return;
      }
      if (previous) {
        const offset = previous.content.length;
        editor.updateBlock(previous.id, { content: previous.content + block.content });
        editor.removeBlock(id!);
        focus(previous.id, offset);
      } else if (next) {
        editor.removeBlock(id!);
        focus(next.id, 0);
      }
      return;
    }
    const destination = event.key === "ArrowLeft" && collapsed && forward === 0
      ? blocks[index - 1]
      : event.key === "ArrowRight" && collapsed && forward === block.content.length
        ? blocks[index + 1]
        : event.key === "ArrowUp" && collapsed
          ? blocks[index - 1]
          : event.key === "ArrowDown" && collapsed
            ? blocks[index + 1]
            : undefined;
    if (!destination) return;
    event.preventDefault();
    const offset = event.key === "ArrowLeft"
      ? destination.content.length
      : Math.min(forward, destination.content.length);
    focus(destination.id, offset);
  });

  return createElement(Fragment, null, children);
}

export function createKeyboardPlugin(defaultBlockType = "paragraph"): ViewPlugin {
  return {
    id: "rivto.keyboard",
    View: ({ children }) => createElement(KeyboardView, { defaultBlockType }, children),
  };
}
