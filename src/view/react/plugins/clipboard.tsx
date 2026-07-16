import { Fragment, createElement, type PropsWithChildren } from "react";
import { RIVTO_BLOCK_ATTR, RIVTO_BLOCK_CONTENT_ATTR } from "../blocks/dom";
import { useEditor, useEditorEvent, useEditorRoot } from "../editor/context";
import { readEditorSelection, restoreEditorSelection } from "../selection";
import type { ViewPlugin } from "../editor/types";

function ClipboardView({ children }: PropsWithChildren) {
  const editor = useEditor();
  const root = useEditorRoot();
  const syncSelection = (): void => {
    if (!root.current) return;
    const selection = readEditorSelection(root.current);
    if (selection) editor.execute("selection.set", { selection });
  };
  const syncDom = (): void => {
    if (!root.current) return;
    root.current.querySelectorAll<HTMLElement>(`[${RIVTO_BLOCK_CONTENT_ATTR}]`).forEach((content) => {
      const id = content.closest<HTMLElement>(`[${RIVTO_BLOCK_ATTR}]`)?.getAttribute(RIVTO_BLOCK_ATTR);
      const block = id ? editor.getBlock(id) : undefined;
      if (block && content.textContent !== block.content) content.textContent = block.content;
    });
    const selection = editor.selection.get();
    if (selection?.type === "text") restoreEditorSelection(root.current, selection);
  };
  useEditorEvent("copy", (event) => {
    if (event.defaultPrevented) return;
    syncSelection();
    editor.execute("clipboard.copy", { event });
  });
  useEditorEvent("cut", (event) => {
    if (event.defaultPrevented) return;
    syncSelection();
    editor.execute("clipboard.cut", { event });
    syncDom();
  });
  useEditorEvent("paste", (event) => {
    if (event.defaultPrevented) return;
    syncSelection();
    editor.execute("clipboard.paste", { event, defaultBlockType: "paragraph" });
    syncDom();
  });
  return createElement(Fragment, null, children);
}

export const clipboardPlugin: ViewPlugin = { id: "rivto.clipboard", View: ClipboardView };
