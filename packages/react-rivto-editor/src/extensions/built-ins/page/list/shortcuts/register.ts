import { registerBlockListActions } from "../../../block-handle/actions";
import { CheckboxBlockBehavior } from "../checkbox-block-behavior";
import { NumberedListBlockBehavior } from "../numbered-list-block-behavior";
import { ListBlockBehavior } from "../list-block-behavior";
import type { ReactEditorExtensionApi } from "../../../../../editor/types";
import type { PanelInputRegistration } from "../../../../../panels/types";
import type { InputRoot } from "@chulane/rivto-root";
/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { createCaretSelection } from "@chulane/rivto";
import { BlockListSlot } from "../../../../../blocks/block-slot-controls/block-slot-controls";
import type { ListShortcutPanel } from "./types";
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
 * @param reactEditor - Runtime receiving delegated content input events.
 * @returns No value.
 */
export function registerListShortcuts(reactEditor: ReactEditorExtensionApi): void {
  registerBlockListActions(reactEditor);
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
        reactPanel.blocks.getBlockNode(blockId)?.listProps.type !== type,
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
   * Converts a shortcut and schedules focus only for its originating registration.
   *
   * @param reactPanel - Receiving panel whose document and selection are updated.
   * @param blockId - Block containing the shortcut.
   * @param shortcut - List properties to apply with the content reset.
   * @param inputRoot - Input Root captured for the original delivery.
   * @param inputRegistration - Routing lifetime captured for the original delivery.
   * @returns True when conversion was committed, or false when the registration is stale.
   * @throws Propagates document, selection, and focus scheduling failures.
   */
  const convert = (
    reactPanel: ListShortcutPanel,
    blockId: string,
    shortcut: ListShortcutPatch,
    inputRoot: Pick<InputRoot, "isAttached">,
    inputRegistration: PanelInputRegistration,
  ): boolean => {
    if (!inputRegistration.isCurrent(inputRoot)) {
      return false;
    }
    reactPanel.batchUpdates(() => {
      reactPanel.blocks.updateBlock(blockId, { listProps: shortcut, content: "" });
      reactPanel.selection.set(createCaretSelection(blockId, 0));
    });
    // Only place the caret and its editing focus; list conversion is already committed.
    if (inputRegistration.isCurrent(inputRoot)) {
      reactPanel.selection.scheduleIfSelectionUnchanged(() => {
        if (inputRegistration.isCurrent(inputRoot)) {
          reactPanel.selection.focusBlock(blockId, 0);
        }
      });
    }
    return true;
  };

  reactEditor.events.register(
    {
      id: "list.shortcut.before-input",
      type: "beforeinput",
      scope: "content",
    },
    ({ reactPanel, textInput, blockId, readContentText, inputRoot, inputRegistration }) => {
      if (textInput?.inputType !== "insertText" || textInput.data !== " " || !blockId) {
        return false;
      }
      const shortcut = listShortcutPatch(`${readContentText?.() ?? ""} `);
      if (!shortcut) {
        return false;
      }
      return convert(reactPanel, blockId, shortcut, inputRoot, inputRegistration);
    },
  );

  reactEditor.events.register(
    {
      id: "list.shortcut.input",
      type: "input",
      scope: "content",
    },
    ({ reactPanel, textInput, blockId, inputRoot, inputRegistration }) => {
      if (textInput?.inputType !== "insertText" || !blockId) {
        return false;
      }
      queueMicrotask(() => {
        if (!inputRegistration.isCurrent(inputRoot)) {
          return;
        }
        const block = reactPanel.blocks.getBlockNode(blockId);
        const shortcut = block
          ? listShortcutPatch(block.content.replaceAll("\u00a0", " "))
          : undefined;
        if (!shortcut) {
          return;
        }
        convert(reactPanel, blockId, shortcut, inputRoot, inputRegistration);
      });
      return false;
    },
  );
}
