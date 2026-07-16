import type { FormEvent } from "react";
import type { RivtoEditorApi } from "../../../editor";
import type { EditorBlock } from "../../../editor/model";
import { RIVTO_BLOCK_CONTENT_ATTR } from "./dom";

export interface BlockTextEditingOptions {
  block: EditorBlock;
  editor: RivtoEditorApi;
  text: string;
}

/**
 * Creates DOM props for the built-in editable block content element.
 *
 * React must not rewrite a focused contenteditable on every document revision:
 * the browser owns the live caret while the user types. The ref updates only
 * when focus is elsewhere or the DOM has diverged from document text.
 */
export function useBlockTextEditing({ block, editor, text = block.content }: Omit<BlockTextEditingOptions, "text"> & { text?: string }) {
  return {
    [RIVTO_BLOCK_CONTENT_ATTR]: "",
    contentEditable: true,
    suppressContentEditableWarning: true,
    ref(element: HTMLElement | null) {
      if (!element || element === document.activeElement || element.textContent === text) return;
      element.textContent = text;
    },
    onFocus() {
      editor.history.stopCapturing();
    },
    onBlur() {
      editor.history.stopCapturing();
    },
    onInput(event: FormEvent<HTMLElement>) {
      editor.updateBlock(block.id, { content: event.currentTarget.textContent ?? "" });
    },
  };
}
