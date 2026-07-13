import type { FormEvent } from "react";
import type { RivtoEditorApi } from "../../editor";
import type { EditorBlock } from "../../editor/model";
import { RIVTO_BLOCK_CONTENT_ATTR } from "./dom";

interface BlockTextEditingOptions {
  block: EditorBlock;
  editor: RivtoEditorApi;
  text: string;
}

/**
 * Creates DOM props for the built-in editable block content element.
 *
 * This keeps contentEditable synchronization in one place. The focused DOM
 * node remains owned by the browser so React rerenders do not move the caret.
 */
export function useBlockTextEditing({ block, editor, text }: BlockTextEditingOptions) {
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
