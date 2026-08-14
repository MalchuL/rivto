/**
 * Provides Rivto's contentless separator block, including accessible
 * presentation, structural selection participation, insertion commands, and
 * edgeless card-partition metadata.
 *
 * @module
 */
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  focusBlock,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  type ReactEditorExtension,
} from "../../managers";
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE } from "../../constants";
import type { CreateDefaultBlock } from "../page/empty-block";
import type { ReactEditor } from "../../types";

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
 * @returns ID of the new writing block focused after the separator.
 */
function insertSeparator(
  reactEditor: ReactEditor,
  blockId: string,
  separatorType: string,
  createDefaultBlock: CreateDefaultBlock,
): string | undefined {
  const { editor } = reactEditor;
  const block = editor.blocks.getBlock(blockId);
  if (!block) return undefined;
  let separatorId = "";
  let writingId = "";
  editor.batchUpdates(() => {
    if (!block.content && !block.children.length) {
      separatorId = block.id;
      editor.blocks.setBlockType(separatorId, separatorType);
      reactEditor.blocks.updateBlock(separatorId, {
        listProps: { collapsed: false, type: "list", checked: false },
      });
    } else {
      separatorId = reactEditor.blocks.insertBlock({
        type: separatorType,
        content: "",
        listProps: { type: "list", checked: false },
      }, block.id);
    }
    writingId = reactEditor.blocks.insertBlock(createDefaultBlock(), separatorId);
    editor.selection.set([{
      type: "text",
      anchor: { blockId: writingId, offset: 0 },
      head: { blockId: writingId, offset: 0 },
    }]);
  });
  return writingId;
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
      const writingId = insertSeparator(
        reactEditor,
        blockId,
        SEPARATOR_BLOCK_TYPE,
        createDefaultBlock,
      );
      const root = reactEditor.events.getRoot();
      if (writingId && root) requestAnimationFrame(() => focusBlock(root, writingId, 0));
    };
    const disposers = [
      reactEditor.blocks.register({
        definition: {
          type: SEPARATOR_BLOCK_TYPE,
          title: "Separator",
        },
        render: SeparatorBlock,
        separatesBlockElements: true,
      }),
      reactEditor.clipboard.registerFormatter({
        id: "separator",
        matches: ({ block }) => block.type === SEPARATOR_BLOCK_TYPE,
        format: () => ({ plain: "---", markdown: "---", html: "<hr>" }),
      }),
      reactEditor.slashCommands.register({
        id: "block.separator.insert",
        title: "Separator",
        group: "Insert",
        keywords: ["divider", "split"],
        execute: ({ blockId }) => focusInserted(blockId),
      }),
      reactEditor.keyboard.register({
        id: KEYBOARD_BINDING_IDS.blockSeparatorCreate,
        keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSeparatorCreate],
        when: ({ raw: event }) => isEditableKeyboardEvent(event),
      }, ({ root }) => {
        const nativeSelection = reactEditor.selection.readDOM();
        if (nativeSelection) reactEditor.editor.selection.set(nativeSelection);
        const target = firstKeyboardTarget(nativeSelection ?? reactEditor.editor.selection.get());
        if (!target) return false;
        const writingId = insertSeparator(
          reactEditor,
          target.blockId,
          SEPARATOR_BLOCK_TYPE,
          createDefaultBlock,
        );
        if (!writingId) return false;
        requestAnimationFrame(() => focusBlock(root, writingId, 0));
        return true;
      }),
    ];
    return () => disposers.reverse().forEach((dispose) => dispose());
  },
});
