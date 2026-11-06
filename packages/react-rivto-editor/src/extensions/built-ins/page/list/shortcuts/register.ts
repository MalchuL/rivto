import { registerBlockListActions } from "../../../block-handle/actions";
import { CheckboxBlockBehavior } from "../checkbox-block-behavior";
import { NumberedListBlockBehavior } from "../numbered-list-block-behavior";
import { ListBlockBehavior } from "../list-block-behavior";
import type { ReactEditorApi } from "../../../../../editor/types";
/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { createCaretSelection } from "@chulane/rivto";
import { BlockListSlot } from "../../../../../blocks/block-slot-controls/block-slot-controls";
import type { ReactPanelApi } from "../../../../../panels/types";
import { focusBlock } from "../../../../../managers";
import type { BlockListType, ListShortcutPatch } from "../types";
import { BLOCK_LIST_TYPES, isNumberedListType, resolveBlockListNumbers } from "../utils";
import { listShortcutPatch } from "./utils";

/**
 * Installs Markdown-style list conversions at the beginning of block content.
 *
 * The beforeinput path recognizes a prefix before the browser inserts the space,
 * preserves the text after the caret, and replaces the shortcut with list properties.
 * The input fallback recognizes a complete shortcut after content has been persisted.
 * Both paths update the block and model caret in one editor batch, then restore focus.
 *
 * @param reactEditor - Runtime receiving delegated content input events.
 * @returns No value.
 */
export function registerListShortcuts(reactEditor: ReactEditorApi): void {
  registerBlockListActions(reactEditor.blockContextMenu);
  const listCommands: readonly { type: BlockListType; title: string }[] = [
    { type: "list", title: "List" },
    { type: "checkbox", title: "Checkbox" },
    { type: "numbered_list", title: "Numbered list" },
    { type: "start_numbered_list", title: "Start numbered list" },
    { type: "continue_numbered_list", title: "Continue numbered list" },
  ];
  listCommands.forEach(({ type, title }) =>
    reactEditor.slashCommands.register({
      id: `list.${type}`,
      title,
      group: "Lists",
      isAvailable: ({ blockId, reactPanel }) =>
        reactEditor.blockListProps.has("list") &&
        reactPanel.blocks.hasBlock(blockId) &&
        (reactPanel.blocks.getBlockNode(blockId)?.listProps.type ?? "list") !== type,
      execute: ({ blockId, reactPanel }) =>
        reactPanel.blocks.updateBlock(blockId, { listProps: { type, checked: false } }),
    }),
  );

  reactEditor.blockListProps.register({
    id: "list",
    defaults: { type: "list", checked: false },
    isValid: (candidate) =>
      BLOCK_LIST_TYPES.includes(candidate.type as BlockListType) &&
      typeof candidate.checked === "boolean",
  });
  reactEditor.blockBehaviors.register(new CheckboxBlockBehavior(), -100);
  reactEditor.blockBehaviors.register(new NumberedListBlockBehavior(), -100);
  reactEditor.blockBehaviors.register(new ListBlockBehavior(), -100);
  reactEditor.surfaces.registerBlockSlot({
    position: "start",
    priority: 300,
    component: BlockListSlot,
    when: ({ block }) =>
      block.listProps.type === "checkbox" || isNumberedListType(block.listProps.type),
  });
  reactEditor.clipboardFormats.registerFormatter({
    id: "list",
    matches: ({ block }) =>
      block.listProps.type === "checkbox" || isNumberedListType(block.listProps.type),
    format: ({ block, siblings, depth }, current) => {
      const type = block.listProps.type;
      const number = resolveBlockListNumbers(siblings).get(block.id);
      const marker =
        type === "checkbox"
          ? `- [${block.listProps.checked === true ? "x" : " "}] `
          : `${number ?? 1}. `;
      const indent = "  ".repeat(depth);
      const plain = `${indent}${marker}${current.plain.slice(indent.length)}`;
      const html =
        type === "checkbox"
          ? `<ul><li><input type="checkbox" disabled${block.listProps.checked === true ? " checked" : ""}>${current.html}</li></ul>`
          : `<ol start="${number ?? 1}"><li value="${number ?? 1}">${current.html}</li></ol>`;
      return { plain, markdown: plain, html };
    },
  });
  /**
   * Replaces a shortcut with list properties and places the caret before the remaining text.
   *
   * The block update and model selection share a batch. Focus is also scheduled
   * for the next frame only while the selection remains unchanged.
   *
   * @param reactPanel - Panel providing block mutations and selection.
   * @param blockId - Block containing the recognized shortcut.
   * @param root - Surface containing the block's editable DOM.
   * @param shortcut - List properties selected by the typed prefix.
   * @param content - Text after the shortcut to retain in the block.
   * @returns No value after updating the block and scheduling caret restoration.
   * @throws If the block update, list-property validation, or DOM focus fails.
   */
  const convert = (
    reactPanel: ReactPanelApi,
    blockId: string,
    root: HTMLElement,
    shortcut: ListShortcutPatch,
    content: string,
  ): void => {
    reactPanel.batchUpdates(() => {
      reactPanel.blocks.updateBlock(blockId, { listProps: shortcut, content });
      reactPanel.selection.set(createCaretSelection(blockId, 0));
    });
    // Move the native caret before reconciliation so the old prefix offset is not retained.
    focusBlock(root, blockId, 0);
    // Only place the caret and its editing focus; list conversion is already committed.
    reactPanel.selection.scheduleIfSelectionUnchanged(() => focusBlock(root, blockId, 0));
  };

  reactEditor.events.register(
    {
      id: "list.shortcut.before-input",
      type: "beforeinput",
      scope: "content",
    },
    ({ reactPanel, raw: event, blockId, contentElement, root }) => {
      if (
        !(event instanceof InputEvent) ||
        event.inputType !== "insertText" ||
        event.data !== " " ||
        !blockId
      ) {
        return false;
      }
      // Before converting a prefix such as "1." when Space is pressed, locate the
      // native caret so only the text before it is checked for a list shortcut.
      // Read it from the content's document, including when the editor is in an iframe.
      // The caret must be inside this block with no text selected: typing over a
      // selection replaces that text and must not trigger shortcut conversion.
      const selection: Selection | null | undefined = contentElement?.ownerDocument.getSelection(); // Read the native caret or selection.
      // A collapsed selection has matching start and end positions: it is a caret,
      // not a selected range of text that normal typing would replace.
      if (
        !contentElement || // The block has no editable content to inspect.
        !selection?.isCollapsed || // No selection, or text is selected instead of a single caret.
        !selection.focusNode || // The caret has no DOM node from which to determine its position.
        !contentElement.contains(selection.focusNode) // The caret belongs to another element.
      ) {
        return false;
      }
      // Split the current DOM text at the caret: only the prefix can be a shortcut,
      // and the suffix must survive conversion even when it is in another text node.
      const remaining = contentElement.ownerDocument.createRange(); // Range for text after the caret.
      remaining.selectNodeContents(contentElement); // Start with the whole block's content.
      remaining.setStart(selection.focusNode, selection.focusOffset); // Keep only the suffix.
      const prefix = contentElement.ownerDocument.createRange(); // Range for text before the caret.
      prefix.selectNodeContents(contentElement); // Start with the whole block's content.
      prefix.setEnd(selection.focusNode, selection.focusOffset); // Keep only the prefix.
      // beforeinput fires before the space is inserted; normalize browser nonbreaking spaces.
      const shortcut = listShortcutPatch(`${prefix.toString().replaceAll("\u00a0", " ")} `);
      if (!shortcut) {
        return false;
      }
      convert(reactPanel, blockId, root, shortcut, remaining.toString());
      return true;
    },
  );

  reactEditor.events.register(
    {
      id: "list.shortcut.input",
      type: "input",
      scope: "content",
    },
    ({ reactPanel, raw: event, blockId, root }) => {
      if (!(event instanceof InputEvent) || event.inputType !== "insertText" || !blockId) {
        return false;
      }
      // The fallback reads persisted content after the input handler has processed the event.
      queueMicrotask(() => {
        const block = reactPanel.blocks.getBlockNode(blockId);
        const shortcut = block
          ? listShortcutPatch(block.content.replaceAll("\u00a0", " "))
          : undefined;
        if (!shortcut) {
          return;
        }
        convert(reactPanel, blockId, root, shortcut, "");
      });
      return false;
    },
  );
}
