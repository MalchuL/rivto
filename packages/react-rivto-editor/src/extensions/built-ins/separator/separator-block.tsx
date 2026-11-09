/**
 * Provides Rivto's contentless separator block, including accessible
 * presentation, structural selection participation, insertion commands, and
 * edgeless card-partition metadata.
 *
 * @module
 */
import { createCaretSelection, type EditorBlock } from "@chulane/rivto";
import {
  BLOCK_EDITOR_CLASSES,
  BlockBody,
  BlockChildren,
  BlockContent,
  BlockRow,
} from "@chulane/rivto-page";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE } from "../../../constants";
import type { ReactPanelApi } from "../../../panels/types";
import {
  BUILTIN_KEYMAP,
  firstKeyboardTarget,
  focusBlock,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  type ReactEditorExtension,
} from "../../../managers";
import { separatorBlockFactory, type BlockFactory } from "../../../block-factories";
import { SEPARATOR_BLOCK_TYPE } from "./constants";

export { SEPARATOR_BLOCK_TYPE } from "./constants";

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
      <span
        className={`${SEPARATOR_ARROW_CLASS} flex h-2.5 items-center [&_svg]:size-2.5`}
        aria-hidden="true"
      >
        <ArrowUpIcon strokeWidth={2.5} />
      </span>
      <span
        className={`${SEPARATOR_LINE_CLASS} w-full border-t border-border`}
        aria-hidden="true"
      />
      <span
        className={`${SEPARATOR_ARROW_CLASS} flex h-2.5 items-center [&_svg]:size-2.5`}
        aria-hidden="true"
      >
        <ArrowDownIcon strokeWidth={2.5} />
      </span>
    </div>
  );
}

/**
 * Distinguishes the separator's descendants while retaining the standard outline behavior.
 *
 * @returns The separator row and its bordered, collapsible child outline.
 */
function SeparatorLayout() {
  return (
    <>
      <BlockRow>
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockChildren
        className={`${BLOCK_EDITOR_CLASSES.outline} rivto-separator-children rounded-md border border-dashed border-border p-[var(--rivto-container-padding,16px)] [&>*]:[opacity:var(--rivto-separator-children-opacity,0.5)]`}
        data-hide-nesting-line="true"
        dropBackground
        dropEndGaps={false}
        dropScope="local"
        renderEmpty={false}
        hoverBoundary={false}
      />
    </>
  );
}

/**
 * Inserts a real separator and a writable default block at the active block level.
 * Empty leaf blocks are converted in place so slash insertion does not leave a
 * meaningless blank block. Content or descendants are never discarded.
 *
 * @param reactPanel - Editor view providing the registered separator type.
 * @param blockId - Active block before which editing should continue.
 * @param separatorBlockFactory - Plugin-owned factory for persisted separators.
 * @param defaultWritingBlockFactory - Factory for the follow-up writing block.
 * @returns Complete new writing block, or undefined when the active block is missing.
 */
function insertSeparator(
  reactPanel: ReactPanelApi,
  blockId: string,
  separatorBlockFactory: BlockFactory,
  defaultWritingBlockFactory: BlockFactory,
): EditorBlock | undefined {
  const block = reactPanel.blocks.getBlockNode(blockId);
  if (!block) {
    return undefined;
  }
  let separatorId = "";
  let writing: EditorBlock | undefined;
  reactPanel.batchUpdates(() => {
    if (!block.content && !reactPanel.blocks.hasChildren(blockId)) {
      separatorId = block.id;
      reactPanel.blocks.setBlockType(separatorId, separatorBlockFactory.createEmptyBlock().type);
      reactPanel.blocks.updateBlock(separatorId, {
        listProps: { collapsed: false, type: "list", checked: false },
      });
    } else {
      separatorId = reactPanel.blocks.insertBlock(
        {
          ...separatorBlockFactory.createEmptyBlock(),
          listProps: { type: "list", checked: false },
        },
        reactPanel.blocks.canRemove(block.id)
          ? reactPanel.blocks.getInsertionDestinationAfter(block.id)
          : { parentId: block.id },
      ).id;
    }
    writing = reactPanel.blocks.insertBlock(
      defaultWritingBlockFactory.createEmptyBlock(),
      reactPanel.blocks.canRemove(separatorId)
        ? reactPanel.blocks.getInsertionDestinationAfter(separatorId)
        : { parentId: separatorId },
    );
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
    const focusInserted = (reactPanel: ReactPanelApi, blockId: string): void => {
      const writing = insertSeparator(
        reactPanel,
        blockId,
        separatorBlockFactory,
        reactEditor.defaultWritingBlockFactory,
      );
      const root = reactPanel.getRoot();
      if (writing && root) {
        requestAnimationFrame(() => focusBlock(root, writing.id, 0));
      }
    };
    const disposers = [
      reactEditor.blockTypes.register({
        definition: {
          type: SEPARATOR_BLOCK_TYPE,
          title: "Separator",
        },
        render: SeparatorBlock,
        layout: SeparatorLayout,
        separatesBlockElements: true,
        clipboard: {
          format: () => ({ plain: "---", markdown: "---", html: "<hr>" }),
          parseHTML: (element) =>
            element.tagName === "HR"
              ? { blocks: [{ type: separatorBlockFactory.createEmptyBlock().type }] }
              : undefined,
        },
      }),
      reactEditor.slashCommands.register({
        id: "block.separator.insert",
        title: "Separator",
        group: "Insert",
        keywords: ["divider", "split"],
        execute: ({ blockId, reactPanel }) => focusInserted(reactPanel, blockId),
      }),
      reactEditor.blockContextMenu.register({
        id: "block.insert-separator",
        title: "Insert separator",
        icon: MinusIcon,
        order: 13,
        /**
         * Keeps insertion within the invoking panel's block scope.
         *
         * @param context - Invoking panel and clicked block.
         * @returns Whether the clicked block can have a sibling in this panel.
         */
        isAvailable: ({ reactPanel, blockId }) => reactPanel.blocks.canRemove(blockId),
        /**
         * Inserts a separator immediately after the clicked block.
         *
         * @param context - Invoking panel and clicked block.
         * @returns No value after inserting the separator.
         * @throws If the panel rejects the insertion.
         */
        execute: ({ reactPanel, blockId }) => {
          reactPanel.blocks.insertBlock(
            separatorBlockFactory.createEmptyBlock(),
            reactPanel.blocks.getInsertionDestinationAfter(blockId),
          );
        },
      }),
      reactEditor.keyboard.register(
        {
          id: KEYBOARD_BINDING_IDS.blockSeparatorCreate,
          keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockSeparatorCreate],
          when: ({ raw: event }) => isEditableKeyboardEvent(event),
        },
        ({ reactPanel, root }) => {
          const nativeSelection = reactPanel.selection.readDOM();
          if (nativeSelection) {
            reactPanel.selection.set(nativeSelection);
          }
          const target = firstKeyboardTarget(nativeSelection ?? reactPanel.selection.get());
          if (!target) {
            return false;
          }
          const writing = insertSeparator(
            reactPanel,
            target.blockId,
            separatorBlockFactory,
            reactEditor.defaultWritingBlockFactory,
          );
          if (!writing) {
            return false;
          }
          requestAnimationFrame(() => focusBlock(root, writing.id, 0));
          return true;
        },
      ),
    ];
    return () => disposers.reverse().forEach((dispose) => dispose());
  },
});
