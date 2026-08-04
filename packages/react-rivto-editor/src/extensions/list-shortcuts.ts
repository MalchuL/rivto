import type { BlockListType } from "@chulane/rivto";
import type { ReactEditor } from "../types";
import { focusBlock } from "../managers";

const SHORTCUTS: Readonly<Record<string, { type: BlockListType; checked: boolean }>> = {
  "- ": { type: "list", checked: false },
  "[] ": { type: "checkbox", checked: false },
  "[ ] ": { type: "checkbox", checked: false },
  "[x] ": { type: "checkbox", checked: true },
  "[X] ": { type: "checkbox", checked: true },
  "1. ": { type: "start_numbered_list", checked: false },
};

/**
 * Installs whole-content Markdown-style list conversions.
 *
 * Conversion waits until React's contenteditable input handler has persisted
 * the typed space, then removes the complete shortcut and restores a caret at
 * offset zero in one editor batch.
 *
 * @param reactEditor - Runtime receiving delegated content input events.
 * @returns No value.
 */
export function registerListShortcuts(reactEditor: ReactEditor): void {
  const convert = (
    blockId: string,
    root: HTMLElement,
    shortcut: { type: BlockListType; checked: boolean },
  ): void => {
    reactEditor.editor.batchUpdates(() => {
      reactEditor.editor.blocks.updateBlock(blockId, { listProps: shortcut, content: "" });
      reactEditor.editor.selection.set([{
        type: "text",
        anchor: { blockId, offset: 0 },
        head: { blockId, offset: 0 },
      }]);
    });
    requestAnimationFrame(() => focusBlock(root, blockId, 0));
  };

  reactEditor.events.register({
    id: "list.shortcut.before-input",
    type: "beforeinput",
    scope: "content",
  }, ({ raw: event, blockId, contentElement, root }) => {
    if (!(event instanceof InputEvent) || event.inputType !== "insertText" || event.data !== " " || !blockId) {
      return false;
    }
    const shortcut = SHORTCUTS[`${contentElement?.textContent ?? ""} `];
    if (!shortcut) return false;
    convert(blockId, root, shortcut);
    return true;
  });

  reactEditor.events.register({
    id: "list.shortcut.input",
    type: "input",
    scope: "content",
  }, ({ raw: event, blockId, root }) => {
    if (!(event instanceof InputEvent) || event.inputType !== "insertText" || !blockId) {
      return false;
    }
    queueMicrotask(() => {
      const block = reactEditor.editor.blocks.getBlock(blockId);
      const shortcut = block ? SHORTCUTS[block.content.replaceAll("\u00a0", " ")] : undefined;
      if (!shortcut) return;
      convert(blockId, root, shortcut);
    });
    return false;
  });
}
