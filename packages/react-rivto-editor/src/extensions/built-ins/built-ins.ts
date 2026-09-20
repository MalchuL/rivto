/**
 * Public built-in extension catalog.
 *
 * Factories hide hook-host components and give applications a declarative,
 * creation-time extension list with stable IDs and focused configuration.
 *
 * @module
 */
import {
  type EditorBlock as Block,
  type EditorBlockInput as BlockInput,
  createStructuralSelection,
} from "@chulane/rivto";
import type { BlockListType } from "./page/list";
import { registerClipboard, type ClipboardExtensionOptions } from "./clipboard/clipboard";
import { registerHistory, type HistoryExtensionOptions } from "./history/history";
import { registerTextSelection } from "./selection/text-selection";
import {
  registerBlockSelectionNavigation,
  registerCaretNavigation,
  registerKeyboardBlockMove,
} from "./page/navigation";
import { registerBlockMerge } from "./page/block-merge";
import { registerBlockOutdent } from "./page/block-outdent";
import { registerEmptyBlockReset } from "./page/empty-block-reset";
import { registerBlockSelection } from "./selection/block-selection";
import { registerCollapse } from "./page/collapse";
import { registerBlockCreation } from "./page/block-creation";
import { SlashMenu } from "./slash/slash-menu";
import { registerSelectionDeletion } from "./selection/selection-deletion";
import { registerTrailingBlock } from "./page/trailing-block";
import { registerIndent, type IndentExtensionOptions } from "./page/indent";
import { registerListShortcuts } from "./page/list";
import { separatorBlockExtension } from "./separator/separator-block";
import { registerDefaultWritingBlock } from "./page/default-writing-block/register";
import type { DefaultWritingBlockOptions } from "./page/default-writing-block/types";
import {
  blockIdsOf,
  insertBlockElementSeparator,
} from "../../elements/block-element-projection";
import { createErrorBlockInput, errorBlockExtension } from "./error/error-block";
import { PageSurface } from "../../surfaces/page";
import {
  type ReactBlockRegistration,
  type ReactEditorExtension,
} from "../../managers";

/**
 * Registers the host writing block, its renderer, and shared writing policy.
 *
 * @param options - Optional writing-block type, renderer, and factories.
 * @returns The configurable built-in writing extension.
 */
export function defaultWritingBlockExtension(
  options: DefaultWritingBlockOptions = {},
): ReactEditorExtension {
  return {
    id: "block.default-writing",
    setup: (reactEditor) => registerDefaultWritingBlock(reactEditor, options),
  };
}

/** @returns The built-in recursive outline surface for block mode. */
export const pageSurfaceExtension = (): ReactEditorExtension => ({
  id: "surface.page",
  setup: (reactEditor) => {
    reactEditor.surfaces.register("block", PageSurface);
  },
});

/**
 * Installs CRDT-backed undo/redo and native contenteditable history suppression.
 *
 * @param options - Optional shortcut and restoration behavior.
 * @returns A mode-independent history extension.
 */
export const historyExtension = (options: HistoryExtensionOptions = {}): ReactEditorExtension => {
  return { id: "history", setup: (reactEditor) => registerHistory(reactEditor, options) };
};

/** @returns DOM-to-editor text and cross-block selection synchronization. */
export const textSelectionExtension = (): ReactEditorExtension => ({
  id: "selection.text",
  setup: registerTextSelection,
});

/**
 * Installs structured and plain-text copy, cut, and paste handling.
 *
 * @param options - Clipboard serialization and paste behavior.
 * @returns A mode-independent clipboard extension.
 */
export const clipboardExtension = (options: ClipboardExtensionOptions = {}): ReactEditorExtension => {
  return { id: "clipboard", setup: (reactEditor) => registerClipboard(reactEditor, options) };
};

/** @returns Pointer and modifier-based whole-block selection for every surface. */
export const blockSelectionExtension = (): ReactEditorExtension => ({
  id: "selection.block",
  setup: registerBlockSelection,
});

/** @returns Visual-line and cross-block caret navigation (card-scoped in edgeless). */
export const caretNavigationExtension = (): ReactEditorExtension =>
  ({ id: "navigation.caret", setup: registerCaretNavigation });

/** @returns Keyboard growth, shrink, and movement of block selections (card-scoped in edgeless). */
export const blockSelectionNavigationExtension = (): ReactEditorExtension =>
  ({ id: "navigation.block-selection", setup: registerBlockSelectionNavigation });

/** @returns Alt+Shift structural movement for eligible blocks (card-scoped in edgeless). */
export const keyboardBlockMoveExtension = (): ReactEditorExtension =>
  ({ id: "block.keyboard-move", setup: registerKeyboardBlockMove });

/** @returns Enter-driven block splitting and creation in editable content. */
export const blockCreationExtension = (): ReactEditorExtension => ({
  id: "block.create",
  setup: registerBlockCreation,
});

/**
 * Installs backward and forward boundary merges as one semantic extension.
 *
 * @returns Backspace-at-start and Delete-at-end merges (card-scoped in edgeless).
 */
export const blockMergeExtension = (): ReactEditorExtension => {
  return {
    id: "block.merge",
    setup: registerBlockMerge,
  };
};

/** @returns Backspace/Delete removal for expanded structural selections. */
export const selectionDeletionExtension = (): ReactEditorExtension =>
  ({ id: "selection.delete", setup: registerSelectionDeletion });

/**
 * Adds accessible page-end controls that append one or more paragraphs.
 *
 * @param count - Number of trailing insertion targets to render.
 * @returns A page-surface visual extension mounted through the normal lifecycle.
 */
export const trailingBlockExtension = (count: number): ReactEditorExtension => {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Trailing block count must be a positive integer");
  }
  return {
    id: "block.trailing-create",
    setup: (reactEditor) => registerTrailingBlock(reactEditor, count),
  };
};

/** @returns Backspace-at-start outdent behavior for nested blocks. */
export const blockOutdentExtension = (): ReactEditorExtension =>
  ({ id: "block.outdent-at-start", setup: registerBlockOutdent });

/** @returns Reset of the first empty custom block to the default paragraph. */
export const emptyBlockResetExtension = (): ReactEditorExtension =>
  ({ id: "block.reset-empty", setup: registerEmptyBlockReset });

/** @returns Markdown-style whole-content shortcuts for built-in list modes. */
export const listShortcutsExtension = (): ReactEditorExtension => ({
  id: "list.shortcuts",
  setup: registerListShortcuts,
});

/** Shortcut configuration for structural indentation. */
export type { IndentExtensionOptions } from "./page/indent";

/**
 * Installs configurable indent and outdent keyboard actions.
 *
 * Both modes use the same core structural commands; binding conditions inside
 * `applyIndentShortcut` decide whether the active selection is eligible.
 *
 * @param options - Optional replacement shortcuts for either action.
 * @returns A functional extension with two stable keyboard binding IDs.
 */
export const indentExtension = (options: IndentExtensionOptions = {}): ReactEditorExtension => {
  return {
    id: "block.indent",
    setup: (reactEditor) => registerIndent(reactEditor, options),
  };
};

/** @returns Shared persisted collapse controls and keyboard actions. */
export const collapseExtension = (): ReactEditorExtension => ({
  id: "block.collapse",
  setup: registerCollapse,
});

/**
 * Adds the inline command menu and generic structural block actions.
 *
 * Block-type conversion entries are registered separately by `registerBlock`.
 * This extension owns only actions valid for arbitrary registered types.
 *
 * @returns A mode-independent slash popup and its core command registrations.
 */
export const slashCommandExtension = (): ReactEditorExtension => ({
  id: "slash.commands",
  setup: (reactEditor) => {
    reactEditor.extensions.mount(SlashMenu);
    const listCommands: readonly { type: BlockListType; title: string }[] = [
      { type: "list", title: "List" },
      { type: "checkbox", title: "Checkbox" },
      { type: "numbered_list", title: "Numbered list" },
      { type: "start_numbered_list", title: "Start numbered list" },
      { type: "continue_numbered_list", title: "Continue numbered list" },
    ];
    const disposers = [
      ...listCommands.map(({ type, title }) => reactEditor.slashCommands.register({
        id: `list.${type}`,
        title,
        group: "Lists",
        isAvailable: ({ blockId }) => reactEditor.blockListProps.has("list") &&
          reactEditor.blocks.getBlock(blockId)?.listProps.type !== type,
        execute: ({ blockId }) => reactEditor.blocks.updateBlock(blockId, { listProps: { type, checked: false } }),
      })),
      // Clone the complete subtree while leaving persisted IDs for the store to generate.
      reactEditor.slashCommands.register({
        id: "block.duplicate",
        title: "Duplicate block",
        group: "Actions",
        keywords: ["copy", "clone"],
        isAvailable: ({ blockId }) => reactEditor.blocks.hasBlock(blockId),
        execute: ({ blockId }) => {
          const block = reactEditor.blocks.getBlock(blockId);
          if (!block) return;
          const input = duplicateBlockInput(block);
          const isEdgelessRoot = reactEditor.mode.get() === "edgeless" && reactEditor.blocks.getParentId(blockId) === null;
          const sourceElement = isEdgelessRoot
            ? reactEditor.elements.getElements().find((element) => element.type === "block" && blockIdsOf(element, reactEditor.blocks.getRootIds()).includes(blockId))
            : undefined;
          let duplicateId = "";
          reactEditor.history.batchUpdates(() => {
            const afterId = isEdgelessRoot
              ? insertBlockElementSeparator(reactEditor, reactEditor.blocks.getRootIds().at(-1)!).id
              : block.id;
            duplicateId = reactEditor.blocks.insertBlock(input, afterId).id;
            if (isEdgelessRoot) reactEditor.elements.insertElement({
              id: duplicateId,
              type: "block",
              frame: sourceElement
                ? { ...sourceElement.frame, x: sourceElement.frame.x + 24, y: sourceElement.frame.y + 24 }
                : { x: 84, y: 84, width: 320, height: 120 },
              zIndex: Math.max(0, ...reactEditor.elements.getElements().map((element) => element.zIndex)) + 1,
              props: { startBlockId: duplicateId, endBlockId: duplicateId },
            });
          });
          reactEditor.selection.set(createStructuralSelection([duplicateId]));
        },
      }),
      // Route deletion through structural selection so descendants are atomic.
      reactEditor.slashCommands.register({
        id: "block.delete",
        title: "Delete block",
        group: "Actions",
        keywords: ["remove"],
        isAvailable: ({ blockId }) => reactEditor.blocks.hasBlock(blockId),
        execute: ({ blockId }) => {
          reactEditor.selection.set(createStructuralSelection([blockId]));
          reactEditor.selection.delete();
        },
      }),
      reactEditor.slashCommands.register({
        id: "block.collapse",
        title: "Collapse block",
        group: "Actions",
        keywords: ["fold", "hide"],
        isAvailable: ({ blockId }) => {
          const block = reactEditor.blocks.getBlock(blockId);
          return reactEditor.blockListProps.has("collapse") &&
            Boolean(block?.children.length && block.listProps.collapsed !== true);
        },
        execute: ({ blockId }) => reactEditor.blocks.updateBlock(blockId, { listProps: { collapsed: true } }),
      }),
      reactEditor.slashCommands.register({
        id: "block.expand",
        title: "Expand block",
        group: "Actions",
        keywords: ["unfold", "show"],
        isAvailable: ({ blockId }) => {
          const block = reactEditor.blocks.getBlock(blockId);
          return reactEditor.blockListProps.has("collapse") &&
            Boolean(block?.children.length && block.listProps.collapsed === true);
        },
        execute: ({ blockId }) => reactEditor.blocks.updateBlock(blockId, { listProps: { collapsed: false } }),
      }),
    ];
    // Core slash registrations are stack-like and therefore dispose in reverse.
    return () => disposers.reverse().forEach((dispose) => dispose());
  },
});

/**
 * Converts a detached block snapshot into recursive insertion input.
 *
 * IDs are intentionally omitted so the core store assigns fresh identity.
 * Mutable payloads are cloned to
 * prevent the new subtree from sharing application-owned object references.
 *
 * @param block - Root snapshot of the subtree to duplicate.
 * @returns Recursive, ID-free input preserving type, list state, content,
 * props, extension data, and descendants.
 */
const duplicateBlockInput = (block: Block): BlockInput => ({
  type: block.type,
  listProps: structuredClone(block.listProps),
  content: block.content,
  props: structuredClone(block.props),
  pluginData: structuredClone(block.pluginData),
  children: block.children.map(duplicateBlockInput),
});

/** Creates one atomic model, renderer, and optional slash-command extension. */
export const blockExtension = (
  registration: ReactBlockRegistration,
): ReactEditorExtension => ({
  id: `block.${registration.definition.type}`,
  setup: (reactEditor) => {
    reactEditor.blockTypes.register(registration);
  },
});

/** Options for {@link standardPreset}. */
export interface StandardPresetOptions {
  /** Number of page-end insertion targets. */
  readonly trailingBlockCount?: number;
  /** Host overrides for the default writing block extension. */
  readonly writing?: DefaultWritingBlockOptions;
}

/**
 * Standard page editing behavior used by normal Rivto applications.
 *
 * Installs `defaultWritingBlockExtension` first so writing factories exist
 * before separator, clipboard, Enter, and related paths run.
 *
 * @param options - Trailing-block count and optional writing overrides.
 * @returns The standard page extension preset without optional drag or canvas features.
 */
export const standardPreset = (
  options: StandardPresetOptions = {},
): ReactEditorExtension => {
  const trailingBlockCount = options.trailingBlockCount ?? 3;
  const extensions = [
    defaultWritingBlockExtension(options.writing),
    errorBlockExtension(),
    separatorBlockExtension(),
    pageSurfaceExtension(),
    historyExtension(),
    textSelectionExtension(),
    slashCommandExtension(),
    listShortcutsExtension(),
    clipboardExtension({ onPrepareError: createErrorBlockInput }),
    blockSelectionExtension(),
    collapseExtension(),
    caretNavigationExtension(),
    blockSelectionNavigationExtension(),
    keyboardBlockMoveExtension(),
    indentExtension(),
    blockCreationExtension(),
    selectionDeletionExtension(),
    trailingBlockExtension(trailingBlockCount),
    blockOutdentExtension(),
    blockMergeExtension(),
    emptyBlockResetExtension(),
  ];
  return {
    id: "rivto.standard",
    setup: (reactEditor) => {
      const cleanups: Array<() => void> = [];
      try {
        for (const extension of extensions) {
          const cleanup = extension.setup(reactEditor);
          if (cleanup) cleanups.push(cleanup);
        }
      } catch (error) {
        cleanups.slice().reverse().forEach((cleanup) => {
          try {
            cleanup();
          } catch {
            // Rollback is best-effort so the original setup error is preserved.
          }
        });
        throw error;
      }
      return () => {
        const errors: unknown[] = [];
        cleanups.slice().reverse().forEach((cleanup) => {
          try {
            cleanup();
          } catch (cleanupError) {
            errors.push(cleanupError);
          }
        });
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, "Standard preset cleanup failed");
      };
    },
  };
};
