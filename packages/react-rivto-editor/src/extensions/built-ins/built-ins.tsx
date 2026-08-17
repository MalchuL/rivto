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
} from "@chulane/rivto";
import {
  BLOCK_LIST_TYPES,
  isNumberedListType,
  resolveBlockListNumbers,
  type BlockListType,
} from "../page/list-properties";
import type { ComponentType, ReactNode } from "react";
import { registerClipboard, type ClipboardExtensionOptions } from "../clipboard/clipboard";
import { registerHistory, type HistoryExtensionOptions } from "../history/history";
import { registerTextSelection } from "../selection/text-selection";
import { EdgelessInteractionOverlay } from "../edgeless/edgeless-selection";
import { installEdgelessRuntime } from "../edgeless/edgeless-runtime";
import { registerEdgelessDeletion } from "../edgeless/edgeless-deletion";
import { registerEdgelessMovement } from "../edgeless/edgeless-movement";
import { registerEdgelessTransform } from "../edgeless/edgeless-transform";
import { EdgelessElementDragSlot } from "../edgeless/edgeless-drag-handle";
import {
  registerBlockSelectionNavigation,
  registerCaretNavigation,
  registerKeyboardBlockMove,
} from "../page/page-navigation";
import {
  registerBackwardBlockMerge,
  registerBlockOutdent,
  registerEmptyBlockReset,
} from "../page/page-backspace";
import { registerBlockSelection } from "../selection/block-selection";
import { registerCollapse } from "../page/page-collapse";
import { registerForwardBlockMerge } from "../page/page-delete";
import {
  PageDragBlockWrapper,
  PageDragBlockSlot,
  PageDragProvider,
  type PageDragExtensionOptions,
} from "../page/page-drag";
import { BlockCollapseSlot, BlockListSlot } from "../../blocks/block-slot-controls";
import { registerBlockCreation } from "../page/page-enter";
import { SlashMenu } from "../slash/slash-menu";
import { registerSelectionDeletion } from "../selection/selection-deletion";
import { TrailingBlock } from "../page/trailing-block";
import { applyIndentShortcut } from "../page/indent";
import { registerListShortcuts } from "../page/list-shortcuts";
import {
  EdgelessSnappingStore,
  EdgelessSurface,
  type EdgelessSurfaceOptions,
} from "../../surfaces/edgeless";
import { separatorBlockExtension } from "../separator/separator-block";
import { defaultWritingBlockExtension, type DefaultWritingBlockOptions } from "../page/default-writing-block";
import {
  blockIdsOf,
  EDGELESS_CARD_DEFAULT_FRAME,
  insertBlockElementSeparator,
  setBlockElementDefaultWidth,
  setBlockElementOverlapAvoidance,
} from "../../surfaces/edgeless/block-elements";
import { createErrorBlockInput, errorBlockExtension } from "../error/error-block";
import { PageSurface } from "../../surfaces/page";
import {
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
  type ReactBlockRegistration,
  type ReactEditorExtension,
} from "../../managers";

/**
 * Adapts a React component to the functional extension lifecycle.
 *
 * Components remain useful for behavior implemented with React hooks, while
 * callers configure the editor exclusively through extension functions.
 *
 * @param id - Stable extension identity used for duplicate detection.
 * @param component - Headless or visual component mounted by EditorView.
 * @returns A creation-time React editor extension.
 */
const componentExtension = (
  id: string,
  component: ComponentType,
): ReactEditorExtension => ({
  id,
  setup: (reactEditor) => {
    reactEditor.extensions.mount(component);
  },
});

/** @returns The built-in recursive outline surface for block mode. */
export const pageSurfaceExtension = (): ReactEditorExtension => ({
  id: "surface.page",
  setup: (reactEditor) => {
    reactEditor.surfaces.register("block", PageSurface);
  },
});

/** @returns The built-in positioned-card surface for edgeless mode. */
export const edgelessSurfaceExtension = (options: EdgelessSurfaceOptions = {}): ReactEditorExtension => {
  const snapping = options.snapping ?? new EdgelessSnappingStore();
  return {
    id: "surface.edgeless",
  setup: (reactEditor) => {
      setBlockElementOverlapAvoidance(reactEditor, options.avoidBlockElementOverlap !== false);
      setBlockElementDefaultWidth(reactEditor, options.blockElementWidth ?? EDGELESS_CARD_DEFAULT_FRAME.width);
      reactEditor.surfaces.register("edgeless", () => <EdgelessSurface snapping={snapping} avoidBlockElementOverlap={options.avoidBlockElementOverlap !== false} blockElementWidth={options.blockElementWidth} />);
    },
  };
};

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
    setup: (reactEditor) => {
      registerBackwardBlockMerge(reactEditor);
      registerForwardBlockMerge(reactEditor);
    },
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
  return componentExtension("block.trailing-create", () => <TrailingBlock count={count} />);
};

/** @returns Backspace-at-start outdent behavior for nested blocks. */
export const blockOutdentExtension = (): ReactEditorExtension =>
  ({ id: "block.outdent-at-start", setup: registerBlockOutdent });

/** @returns Reset of the first empty custom block to the default paragraph. */
export const emptyBlockResetExtension = (): ReactEditorExtension =>
  ({ id: "block.reset-empty", setup: registerEmptyBlockReset });

/** @returns Markdown-style whole-content shortcuts for built-in list modes. */
export const listShortcutsExtension = (): ReactEditorExtension =>
  ({
    id: "list.shortcuts",
    setup: (reactEditor) => {
      reactEditor.blocks.registerListProps({
        id: "list",
        defaults: { type: "list", checked: false },
        validate: (candidate) =>
          BLOCK_LIST_TYPES.includes(candidate.type as BlockListType) &&
          typeof candidate.checked === "boolean",
      });
      reactEditor.surfaces.registerBlockSlot({
        position: "start",
        priority: 300,
        component: BlockListSlot,
        when: ({ block }) =>
          block.listProps.type === "checkbox" || isNumberedListType(block.listProps.type),
      });
      reactEditor.clipboard.registerFormatter({
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
      registerListShortcuts(reactEditor);
    },
  });

/** Shortcut configuration for structural indentation. */
export interface IndentExtensionOptions {
  /** Bindings that indent the active block or eligible sibling selection. */
  readonly indentKeys?: readonly string[];
  /** Bindings that outdent while preserving the selected subtree structure. */
  readonly outdentKeys?: readonly string[];
}

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
  const indentKeys = options.indentKeys ?? BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockIndent]!;
  const outdentKeys = options.outdentKeys ?? BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockOutdent]!;
  return {
    id: "block.indent",
    setup: (reactEditor) => {
      reactEditor.keyboard.register({
        id: KEYBOARD_BINDING_IDS.blockIndent,
        keys: indentKeys,
      }, ({ editor, root, raw: event }) => applyIndentShortcut(
        editor,
        reactEditor.selection,
        root,
        event,
        false,
      ));
      reactEditor.keyboard.register({
        id: KEYBOARD_BINDING_IDS.blockOutdent,
        keys: outdentKeys,
      }, ({ editor, root, raw: event }) => applyIndentShortcut(
        editor,
        reactEditor.selection,
        root,
        event,
        true,
      ));
    },
  };
};

/** @returns Shared persisted collapse controls and keyboard actions. */
export const collapseExtension = (): ReactEditorExtension => ({
  id: "block.collapse",
  setup: (reactEditor) => {
    reactEditor.blocks.registerListProps({
      id: "collapse",
      defaults: { collapsed: false },
      validate: (candidate) => typeof candidate.collapsed === "boolean",
    });
    reactEditor.surfaces.registerBlockSlot({
      position: "left-top",
      priority: 100,
      component: BlockCollapseSlot,
      when: ({ block }) => block.children.length > 0,
    });
    return registerCollapse(reactEditor);
  },
});

/** @returns Root-card click, toggle, and rectangle selection in edgeless mode. */
export const edgelessSelectionExtension = (): ReactEditorExtension =>
  ({
    id: "selection.edgeless",
    setup: (reactEditor) => {
      const disposeRuntime = installEdgelessRuntime(reactEditor);
      reactEditor.extensions.mount(EdgelessInteractionOverlay);
      return disposeRuntime;
    },
  });

/** @returns Atomic Backspace/Delete removal of selected canvas blocks. */
export const edgelessDeletionExtension = (): ReactEditorExtension =>
  ({ id: "selection.edgeless-delete", setup: registerEdgelessDeletion });

/** @returns One- or ten-pixel keyboard movement of selected canvas roots. */
export const edgelessMovementExtension = (): ReactEditorExtension =>
  ({ id: "movement.edgeless", setup: registerEdgelessMovement });

/** @returns Pointer drag and resize interactions for edgeless root cards. */
export const edgelessTransformExtension = (): ReactEditorExtension => ({
  id: "transform.edgeless",
  setup: (reactEditor) => {
    reactEditor.surfaces.registerElementSlot({
      position: "left-top",
      priority: 100,
      component: EdgelessElementDragSlot,
      mode: "edgeless",
      when: ({ element, selected }) => selected && element.type !== "connector",
    });
    return registerEdgelessTransform(reactEditor);
  },
});

/** Page drag configuration excluding the wrapper-owned React children slot. */
export type PageDragOptions = Omit<PageDragExtensionOptions, "children">;

/**
 * Creates structural drag-and-drop behavior for both built-in modes.
 *
 * The editor wrapper owns dnd-kit's gesture runtime and overlay. Registered
 * block wrappers connect each recursively rendered row to that boundary. Keeping
 * these registrations together guarantees that a wrapper is never installed
 * without its required editor-wide context.
 *
 * @param options - Pointer activation and page drop-zone tuning.
 * @returns Functional React editor extension installed by createReactEditor.
 */
export const pageDragExtension = (options: PageDragOptions = {}): ReactEditorExtension => {
  const DragBoundary = ({ children }: { readonly children?: ReactNode }) => (
    <PageDragProvider {...options}>{children}</PageDragProvider>
  );
  return {
    id: "drag.page",
    setup: (reactEditor) => {
      reactEditor.surfaces.registerEditorWrapper(DragBoundary);
      reactEditor.surfaces.registerBlockWrapper("block", PageDragBlockWrapper);
      reactEditor.surfaces.registerBlockWrapper("edgeless", PageDragBlockWrapper);
      reactEditor.surfaces.registerBlockSlot({
        position: "left-top",
        priority: 200,
        component: PageDragBlockSlot,
      });
    },
  };
};

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
    const { editor } = reactEditor;
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
        isAvailable: ({ blockId }) => reactEditor.blocks.hasListProps("list") &&
          editor.blocks.getBlock(blockId)?.listProps.type !== type,
        execute: ({ blockId }) => reactEditor.blocks.updateBlock(blockId, { listProps: { type, checked: false } }),
      })),
      // Clone the complete subtree while leaving persisted IDs for the store to generate.
      reactEditor.slashCommands.register({
        id: "block.duplicate",
        title: "Duplicate block",
        group: "Actions",
        keywords: ["copy", "clone"],
        isAvailable: ({ blockId }) => Boolean(editor.blocks.getBlock(blockId)),
        execute: ({ blockId }) => {
          const block = editor.blocks.getBlock(blockId);
          if (!block) return;
          const input = duplicateBlockInput(block);
          const isEdgelessRoot = editor.mode.get() === "edgeless" && editor.blocks.getParentId(blockId) === null;
          const sourceElement = isEdgelessRoot
            ? editor.elements.getElements().find((element) => element.type === "block" && blockIdsOf(element, editor.blocks.getRootIds()).includes(blockId))
            : undefined;
          let duplicateId = "";
          editor.batchUpdates(() => {
            const afterId = isEdgelessRoot
              ? insertBlockElementSeparator(reactEditor, editor.blocks.getRootIds().at(-1)!)
              : block.id;
            duplicateId = reactEditor.blocks.insertBlock(input, afterId);
            if (isEdgelessRoot) editor.elements.insertElement({
              id: duplicateId,
              type: "block",
              frame: sourceElement
                ? { ...sourceElement.frame, x: sourceElement.frame.x + 24, y: sourceElement.frame.y + 24 }
                : { x: 84, y: 84, width: 320, height: 120 },
              zIndex: Math.max(0, ...editor.elements.getElements().map((element) => element.zIndex)) + 1,
              props: { startBlockId: duplicateId, endBlockId: duplicateId },
            });
          });
          editor.selection.set([{
            type: "block",
            blockIds: [duplicateId],
            anchorBlockId: duplicateId,
            focusBlockId: duplicateId,
          }]);
        },
      }),
      // Route deletion through structural selection so descendants are atomic.
      reactEditor.slashCommands.register({
        id: "block.delete",
        title: "Delete block",
        group: "Actions",
        keywords: ["remove"],
        isAvailable: ({ blockId }) => Boolean(editor.blocks.getBlock(blockId)),
        execute: ({ blockId }) => {
          editor.selection.set([{
            type: "block",
            blockIds: [blockId],
            anchorBlockId: blockId,
            focusBlockId: blockId,
          }]);
          editor.deleteSelection();
        },
      }),
      reactEditor.slashCommands.register({
        id: "block.collapse",
        title: "Collapse block",
        group: "Actions",
        keywords: ["fold", "hide"],
        isAvailable: ({ blockId }) => {
          const block = editor.blocks.getBlock(blockId);
          return reactEditor.blocks.hasListProps("collapse") &&
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
          const block = editor.blocks.getBlock(blockId);
          return reactEditor.blocks.hasListProps("collapse") &&
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
 * IDs and links are intentionally omitted so the core store assigns fresh
 * identity without duplicating link ownership. Mutable payloads are cloned to
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
    reactEditor.blocks.register(registration);
  },
});

/** Options for {@link standardPreset}. */
export interface StandardPresetOptions {
  /** Number of page-end insertion targets. */
  readonly trailingBlockCount?: number;
  /** Host overrides for the default writing block extension. */
  readonly writing?: DefaultWritingBlockOptions;
  /** Host-owned edgeless viewport settings. */
  readonly edgeless?: EdgelessSurfaceOptions;
}

/**
 * Complete built-in editing behavior used by normal Rivto applications.
 *
 * Installs `defaultWritingBlockExtension` first so writing factories exist
 * before separator, clipboard, Enter, and related paths run.
 *
 * @param options - Trailing-block count and optional writing overrides.
 * @returns The complete built-in extension preset.
 */
export const standardPreset = (
  options: number | StandardPresetOptions = {},
): ReactEditorExtension => {
  const resolved: StandardPresetOptions = typeof options === "number"
    ? { trailingBlockCount: options }
    : options;
  const trailingBlockCount = resolved.trailingBlockCount ?? 3;
  const extensions = [
    defaultWritingBlockExtension(resolved.writing),
    errorBlockExtension(),
    separatorBlockExtension(),
    pageSurfaceExtension(),
    edgelessSurfaceExtension(resolved.edgeless),
    historyExtension(),
    textSelectionExtension(),
    slashCommandExtension(),
    listShortcutsExtension(),
    clipboardExtension({ onBlockError: createErrorBlockInput }),
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
    pageDragExtension(),
    edgelessSelectionExtension(),
    edgelessTransformExtension(),
    edgelessDeletionExtension(),
    edgelessMovementExtension(),
  ];
  return {
    id: "rivto.standard",
    setup: (reactEditor) => {
      const cleanups = extensions.flatMap((extension) => {
        const cleanup = extension.setup(reactEditor);
        return cleanup ? [cleanup] : [];
      });
      return () => cleanups.reverse().forEach((cleanup) => cleanup());
    },
  };
};
