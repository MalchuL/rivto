import { DEFAULT_BLOCK_TYPE } from "@chulane/rivto";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  focusBlock,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  type ReactEditorExtension,
} from "../../managers";
import type { ReactEditor } from "../../types";

/** Persisted native type installed by the built-in separator extension. */
export const SEPARATOR_BLOCK_TYPE = "separator";

/** Contentless divider renderer shared by page and nested edgeless block trees. */
export function SeparatorBlock() {
  return (
    <div
      className="rivto-separator-block"
      data-separator-block="true"
      role="separator"
      aria-label="Block element separator"
    >
      <span className="rivto-separator-arrow" aria-hidden="true">↑</span>
      <span className="rivto-separator-line" aria-hidden="true" />
      <span className="rivto-separator-arrow" aria-hidden="true">↓</span>
    </div>
  );
}

/**
 * Inserts a real separator and a writable paragraph at the active block level.
 * Empty leaf blocks are converted in place so slash insertion does not leave a
 * meaningless blank block. Content or descendants are never discarded.
 *
 * @param reactEditor - Runtime providing the registered separator type.
 * @param blockId - Active block before which editing should continue.
 * @param separatorType - Plugin-owned persisted separator type.
 * @returns ID of the new paragraph focused after the separator.
 */
function insertSeparator(
  reactEditor: ReactEditor,
  blockId: string,
  separatorType: string,
): string | undefined {
  const { editor } = reactEditor;
  const block = editor.blocks.getBlock(blockId);
  if (!block) return undefined;
  let separatorId = "";
  let paragraphId = "";
  editor.batchUpdates(() => {
    if (!block.content && !block.children.length) {
      separatorId = block.id;
      editor.blocks.setBlockType(separatorId, separatorType);
      editor.blocks.updateBlock(separatorId, {
        collapsed: false,
        listProps: { type: "list", checked: false },
      });
    } else {
      separatorId = editor.blocks.insertBlock({
        type: separatorType,
        content: "",
        listProps: { type: "list", checked: false },
      }, block.id);
    }
    paragraphId = editor.blocks.insertBlock({ type: DEFAULT_BLOCK_TYPE, content: "" }, separatorId);
    editor.selection.set([{
      type: "text",
      anchor: { blockId: paragraphId, offset: 0 },
      head: { blockId: paragraphId, offset: 0 },
    }]);
  });
  return paragraphId;
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
    const focusInserted = (blockId: string): void => {
      const paragraphId = insertSeparator(reactEditor, blockId, SEPARATOR_BLOCK_TYPE);
      const root = reactEditor.events.getRoot();
      if (paragraphId && root) requestAnimationFrame(() => focusBlock(root, paragraphId, 0));
    };
    const disposers = [
      reactEditor.blocks.register({
        definition: {
          type: SEPARATOR_BLOCK_TYPE,
          title: "Separator",
          toRawText: () => "---",
        },
        render: SeparatorBlock,
        separatesBlockElements: true,
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
        const paragraphId = insertSeparator(reactEditor, target.blockId, SEPARATOR_BLOCK_TYPE);
        if (!paragraphId) return false;
        requestAnimationFrame(() => focusBlock(root, paragraphId, 0));
        return true;
      }),
    ];
    return () => disposers.reverse().forEach((dispose) => dispose());
  },
});
