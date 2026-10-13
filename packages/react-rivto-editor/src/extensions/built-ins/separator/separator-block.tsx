/**
 * Provides Rivto's contentless separator block, including accessible
 * presentation, structural selection participation, insertion commands, and
 * edgeless card-partition metadata.
 *
 * @module
 */
import { createCaretSelection, type EditorBlock } from "@chulane/rivto";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE } from "../../../constants";
import type { ReactPanelApi } from "../../../panels/types";
import { BUILTIN_KEYMAP, firstKeyboardTarget, focusBlock, isEditableKeyboardEvent, KEYBOARD_BINDING_IDS, type ReactEditorExtension } from "../../../managers";
import type { CreateDefaultBlock } from "../page/default-writing-block";

/** Persisted native type installed by the built-in separator extension. */
export const SEPARATOR_BLOCK_TYPE = "separator";
const SEPARATOR_BLOCK_CLASS = "rivto-separator-block";
const SEPARATOR_LINE_CLASS = "rivto-separator-line";
const SEPARATOR_ARROW_CLASS = "rivto-separator-arrow";
const SEPARATOR_SELECTION_ATTRIBUTES = { [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" };

/**
 * Contentless divider renderer shared by page and nested edgeless block trees.
 *
 * @returns A three-row grid: an upward arrow, the rule, and a downward arrow.
 */
export function SeparatorBlock() {
  return (
    <div
      {...SEPARATOR_SELECTION_ATTRIBUTES}
      className={`${SEPARATOR_BLOCK_CLASS} grid min-h-[21px] w-full grid-rows-[10px_1px_10px] place-items-center text-muted-foreground select-none`}
      data-separator-block="true"
      role="separator"
      aria-label="Block element separator"
    >
      <span className={`${SEPARATOR_ARROW_CLASS} flex h-2.5 items-center [&_svg]:size-2.5`} aria-hidden="true">
        <ArrowUpIcon strokeWidth={2.5} />
      </span>
      <span className={`${SEPARATOR_LINE_CLASS} w-full border-t border-border`} aria-hidden="true" />
      <span className={`${SEPARATOR_ARROW_CLASS} flex h-2.5 items-center [&_svg]:size-2.5`} aria-hidden="true">
        <ArrowDownIcon strokeWidth={2.5} />
      </span>
    </div>
  );
}

/**
 * Inserts a real separator and a writable default block at the active block level.
 * Empty leaf blocks are converted in place so slash insertion does not leave a
 * meaningless blank block. Content or descendants are never discarded.
 *
 * @param reactPanel - Editor view providing the registered separator type.
 * @param blockId - Active block before which editing should continue.
 * @param separatorType - Plugin-owned persisted separator type.
 * @param createDefaultBlock - Factory for the follow-up writing block.
 * @returns Complete new writing block, or undefined when the active block is missing.
 */
function insertSeparator(
  reactPanel: ReactPanelApi,
  blockId: string,
  separatorType: string,
  createDefaultBlock: CreateDefaultBlock,
): EditorBlock | undefined {
  const block = reactPanel.blocks.getBlockNode(blockId);
  if (!block) return undefined;
  let separatorId = "";
  let writing: EditorBlock | undefined;
  reactPanel.batchUpdates(() => {
    if (!block.content && !reactPanel.blocks.hasChildren(blockId)) {
      separatorId = block.id;
      reactPanel.blocks.setBlockType(separatorId, separatorType);
      reactPanel.blocks.updateBlock(separatorId, {
        listProps: { collapsed: false, type: "list", checked: false },
      });
    } else {
      separatorId = reactPanel.blocks.insertBlock({
        type: separatorType,
        content: "",
        listProps: { type: "list", checked: false },
      }, reactPanel.blocks.canRemove(block.id) ? reactPanel.blocks.getInsertionDestinationAfter(block.id) : { parentId: block.id }).id;
    }
    writing = reactPanel.blocks.insertBlock(createDefaultBlock(), reactPanel.blocks.canRemove(separatorId) ? reactPanel.blocks.getInsertionDestinationAfter(separatorId) : { parentId: separatorId });
    reactPanel.selection.set(createCaretSelection(writing.id, 0));
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
    const focusInserted = (reactPanel: ReactPanelApi, blockId: string): void => {
      const writing = insertSeparator(
        reactPanel,
        blockId,
        SEPARATOR_BLOCK_TYPE,
        createDefaultBlock,
      );
      const root = reactPanel.events.getRoot();
      if (writing && root) requestAnimationFrame(() => focusBlock(root, writing.id, 0));
    };
    const disposers = [
      reactEditor.blockTypes.register({
        definition: {
          type: SEPARATOR_BLOCK_TYPE,
          title: "Separator",
        },
        render: SeparatorBlock,
        separatesBlockElements: true,
        clipboard: {
          format: () => ({ plain: "---", markdown: "---", html: "<hr>" }),
          parseHTML: element => element.tagName === "HR" ? { blocks: [{ type: SEPARATOR_BLOCK_TYPE }] } : undefined,
        },
      }),
      reactEditor.slashCommands.register({
        id: "block.separator.insert",
        title: "Separator",
        group: "Insert",
        keywords: ["divider", "split"],
        execute: ({ blockId, reactPanel }) => focusInserted(reactPanel, blockId),
      }),
      reactEditor.keyboard.register({
        id: KEYBOARD_BINDING_IDS.blockSeparatorCreate,
        keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSeparatorCreate],
        when: ({ raw: event }) => isEditableKeyboardEvent(event),
      }, ({ reactPanel, root }) => {
        const nativeSelection = reactPanel.selection.readDOM();
        if (nativeSelection) reactPanel.selection.set(nativeSelection);
        const target = firstKeyboardTarget(nativeSelection ?? reactPanel.selection.get());
        if (!target) return false;
        const writing = insertSeparator(
          reactPanel,
          target.blockId,
          SEPARATOR_BLOCK_TYPE,
          createDefaultBlock,
        );
        if (!writing) return false;
        requestAnimationFrame(() => focusBlock(root, writing.id, 0));
        return true;
      }),
    ];
    return () => disposers.reverse().forEach((dispose) => dispose());
  },
});
