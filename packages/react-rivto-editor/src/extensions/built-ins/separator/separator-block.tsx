/**
 * Provides Rivto's contentless separator block, including accessible
 * presentation, structural selection participation, insertion commands, and
 * edgeless card-partition metadata.
 *
 * @module
 */
import { createCaretSelection, type EditorBlock } from "@chulane/rivto";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  focusBlock,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  type ReactEditorExtension,
} from "../../../managers";
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE } from "../../../constants";
import type { CreateDefaultBlock } from "../page/default-writing-block";
import type { ReactEditor } from "../../../types";

/** Persisted native type installed by the built-in separator extension. */
export const SEPARATOR_BLOCK_TYPE = "separator";
const SEPARATOR_BLOCK_CLASS = "rivto-separator-block";
const SEPARATOR_LINE_CLASS = "rivto-separator-line";
const SEPARATOR_ARROW_CLASS = "rivto-separator-arrow";
const SEPARATOR_SELECTION_ATTRIBUTES = { [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" };

/** Contentless divider renderer shared by page and nested edgeless block trees. */
export function SeparatorBlock() {
  return (
    <div
      {...SEPARATOR_SELECTION_ATTRIBUTES}
      className={SEPARATOR_BLOCK_CLASS}
      data-separator-block="true"
      role="separator"
      aria-label="Block element separator"
    >
      <span className={SEPARATOR_ARROW_CLASS} aria-hidden="true">↑</span>
      <span className={SEPARATOR_LINE_CLASS} aria-hidden="true" />
      <span className={SEPARATOR_ARROW_CLASS} aria-hidden="true">↓</span>
    </div>
  );
}

/**
 * Inserts a real separator and a writable default block at the active block level.
 * Empty leaf blocks are converted in place so slash insertion does not leave a
 * meaningless blank block. Content or descendants are never discarded.
 *
 * @param reactEditor - Runtime providing the registered separator type.
 * @param blockId - Active block before which editing should continue.
 * @param separatorType - Plugin-owned persisted separator type.
 * @param createDefaultBlock - Factory for the follow-up writing block.
 * @returns Complete new writing block, or undefined when the active block is missing.
 */
function insertSeparator(
  reactEditor: ReactEditor,
  blockId: string,
  separatorType: string,
  createDefaultBlock: CreateDefaultBlock,
): EditorBlock | undefined {
  const block = reactEditor.blocks.getBlockNode(blockId);
  if (!block) return undefined;
  let separatorId = "";
  let writing: EditorBlock | undefined;
  reactEditor.history.batchUpdates(() => {
    if (!block.content && !reactEditor.blocks.hasChildren(blockId)) {
      separatorId = block.id;
      reactEditor.blocks.setBlockType(separatorId, separatorType);
      reactEditor.blocks.updateBlock(separatorId, {
        listProps: { collapsed: false, type: "list", checked: false },
      });
    } else {
      separatorId = reactEditor.blocks.insertBlock({
        type: separatorType,
        content: "",
        listProps: { type: "list", checked: false },
      }, block.id).id;
    }
    writing = reactEditor.blocks.insertBlock(createDefaultBlock(), separatorId);
    reactEditor.selection.set(createCaretSelection(writing.id, 0));
  });
  return writing;
}

/**
 * Installs the native separator block, its insertion actions, and its edgeless
 * partition role. The core model remains unaware of this React-owned feature.
 *
 * @returns Extension included by the standard preset and reusable by custom presets.
 */
export const separatorBlockExtension = (): ReactEditorExtension => ({
  id: "block.separator",
  setup: (reactEditor) => {
    const createDefaultBlock = () => reactEditor.createDefaultBlock();
    const focusInserted = (blockId: string): void => {
      const writing = insertSeparator(
        reactEditor,
        blockId,
        SEPARATOR_BLOCK_TYPE,
        createDefaultBlock,
      );
      const root = reactEditor.events.getRoot();
      if (writing && root) requestAnimationFrame(() => focusBlock(root, writing.id, 0));
    };
    reactEditor.blockTypes.register({
      definition: {
        type: SEPARATOR_BLOCK_TYPE,
        title: "Separator",
      },
      render: SeparatorBlock,
      separatesBlockElements: true,
    });
    reactEditor.clipboard.registerFormatter({
      id: "separator",
      matches: ({ block }) => block.type === SEPARATOR_BLOCK_TYPE,
      format: () => ({ plain: "---", markdown: "---", html: "<hr>" }),
    });
    reactEditor.slashCommands.register({
      id: "block.separator.insert",
      title: "Separator",
      group: "Insert",
      keywords: ["divider", "split"],
      execute: ({ blockId }) => focusInserted(blockId),
    });
    reactEditor.keyboard.register({
      id: KEYBOARD_BINDING_IDS.blockSeparatorCreate,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSeparatorCreate],
      when: ({ raw: event }) => isEditableKeyboardEvent(event),
    }, ({ root }) => {
      const nativeSelection = reactEditor.selection.readDOM();
      if (nativeSelection) reactEditor.selection.set(nativeSelection);
      const target = firstKeyboardTarget(nativeSelection ?? reactEditor.selection.get());
      if (!target) return false;
      const writing = insertSeparator(
        reactEditor,
        target.blockId,
        SEPARATOR_BLOCK_TYPE,
        createDefaultBlock,
      );
      if (!writing) return false;
      requestAnimationFrame(() => focusBlock(root, writing.id, 0));
      return true;
    });
  },
});
