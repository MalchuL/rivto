import { focusCaret, scheduleBlockFocus } from "../../../../../block-behaviors/ops/focus-ops";
import { convertEmptyToList } from "../../../../../block-behaviors/ops/text-ops";
import type { EditorRuntime } from "../../../../../editor/editor-runtime";
/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { createCaretSelection } from "@chulane/rivto";
import { BlockListSlot } from "../../../../../blocks/block-slot-controls/block-slot-controls";
import type { EditorViewApi } from "../../../../../editor-view/types";
import { focusBlock } from "../../../../../managers";
import type { BlockListType, ListShortcutPatch } from "../types";
import { BLOCK_LIST_TYPES, isNumberedListType, resolveBlockListNumbers } from "../utils";
import { listShortcutPatch } from "./utils";

/**
 * Installs whole-content Markdown-style list conversions.
 *
 * Conversion waits until React's contenteditable input handler has persisted
 * the typed space, then removes the complete shortcut and restores a caret at
 * offset zero in one editor batch.
 *
 * @param editorRuntime - Runtime receiving delegated content input events.
 * @returns No value.
 */
export function registerListShortcuts(editorRuntime: EditorRuntime): void {
  const listCommands: readonly { type: BlockListType; title: string }[] = [
    { type: "list", title: "List" },
    { type: "checkbox", title: "Checkbox" },
    { type: "numbered_list", title: "Numbered list" },
    { type: "start_numbered_list", title: "Start numbered list" },
    { type: "continue_numbered_list", title: "Continue numbered list" },
  ];
  listCommands.forEach(({ type, title }) => editorRuntime.slashCommands.register({
    id: `list.${type}`,
    title,
    group: "Lists",
    isAvailable: ({ blockId }) => editorRuntime.blockListProps.has("list") &&
      editorRuntime.blocks.getBlockNode(blockId)?.listProps.type !== type,
    execute: ({ blockId }) => editorRuntime.blocks.updateBlock(blockId, { listProps: { type, checked: false } }),
  }));

  editorRuntime.blockListProps.register({
    id: "list",
    prepareSplit: (block) => {
      let type: BlockListType = "list";
      if (block.listProps.type === "checkbox") type = "checkbox";
      else if (isNumberedListType(block.listProps.type)) type = "numbered_list";
      return { type, checked: false };
    },
    onSplit: ({ editorView, block, root }) => {
      if (editorView.runtime.isEmptyBlock(block) &&
        (block.listProps.type === "checkbox" || isNumberedListType(block.listProps.type))) {
        // The first Enter removes only the visible list state; the block keeps
        // its outline position and unrelated properties for the next press.
        editorView.runtime.blocks.deleteListProps(block.id, ["type", "checked"]);
        focusCaret(editorView, root, block.id, 0);
        return true;
      }
      if (!editorView.runtime.blocks.getParentId(block.id) && editorView.runtime.isEmptyBlock(block) && block.listProps.type !== "list") {
        convertEmptyToList(editorView, block.id);
        scheduleBlockFocus(editorView, root, block.id, 0);
        return true;
      }
      return false;
    },
    defaults: { type: "list", checked: false },
    isValid: (candidate) =>
      BLOCK_LIST_TYPES.includes(candidate.type as BlockListType) &&
      typeof candidate.checked === "boolean",
  });
  editorRuntime.surfaces.registerBlockSlot({
    position: "start",
    priority: 300,
    component: BlockListSlot,
    when: ({ block }) =>
      block.listProps.type === "checkbox" || isNumberedListType(block.listProps.type),
  });
  editorRuntime.clipboardFormats.registerFormatter({
    id: "list",
    matches: ({ block }) =>
      block.listProps.type === "checkbox" || isNumberedListType(block.listProps.type),
    format: ({ block, siblings, depth }, current) => {
      const type = block.listProps.type;
      const number = resolveBlockListNumbers(siblings).get(block.id);
      const marker = type === "checkbox"
        ? `- [${block.listProps.checked === true ? "x" : " "}] `
        : `${number ?? 1}. `;
      const indent = "  ".repeat(depth);
      const plain = `${indent}${marker}${current.plain.slice(indent.length)}`;
      const html = type === "checkbox"
        ? `<ul><li><input type="checkbox" disabled${block.listProps.checked === true ? " checked" : ""}>${current.html}</li></ul>`
        : `<ol start="${number ?? 1}"><li value="${number ?? 1}">${current.html}</li></ol>`;
      return { plain, markdown: plain, html };
    },
  });
  const convert = (
    editorView: EditorViewApi,
    blockId: string,
    root: HTMLElement,
    shortcut: ListShortcutPatch,
  ): void => {
    editorView.runtime.history.batchUpdates(() => {
      editorView.runtime.blocks.updateBlock(blockId, { listProps: shortcut, content: "" });
      editorView.selection.set(createCaretSelection(blockId, 0));
    });
    // Only place the caret and its editing focus; list conversion is already committed.
    editorView.selection.scheduleIfSelectionUnchanged(() => focusBlock(root, blockId, 0));
  };

  editorRuntime.events.register({
    id: "list.shortcut.before-input",
    type: "beforeinput",
    scope: "content",
  }, ({ editorView, raw: event, blockId, contentElement, root }) => {
    if (!(event instanceof InputEvent) || event.inputType !== "insertText" || event.data !== " " || !blockId) {
      return false;
    }
    const shortcut = listShortcutPatch(`${contentElement?.textContent ?? ""} `);
    if (!shortcut) return false;
    convert(editorView, blockId, root, shortcut);
    return true;
  });

  editorRuntime.events.register({
    id: "list.shortcut.input",
    type: "input",
    scope: "content",
  }, ({ editorView, raw: event, blockId, root }) => {
    if (!(event instanceof InputEvent) || event.inputType !== "insertText" || !blockId) {
      return false;
    }
    queueMicrotask(() => {
      const block = editorView.runtime.blocks.getBlockNode(blockId);
      const shortcut = block ? listShortcutPatch(block.content.replaceAll("\u00a0", " ")) : undefined;
      if (!shortcut) return;
      convert(editorView, blockId, root, shortcut);
    });
    return false;
  });
}
