/**
 * Public functional plugin catalog.
 *
 * Factories hide hook-host components and give applications a declarative,
 * creation-time plugin list with stable IDs and focused configuration.
 *
 * @module
 */
import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import { ClipboardPlugin, type ClipboardPluginProps } from "./plugins/clipboard-plugin";
import { HistoryPlugin, type HistoryPluginProps } from "./plugins/history-plugin";
import { TextSelectionPlugin } from "./plugins/text-selection-plugin";
import { EdgelessSelectionPlugin } from "./plugins/EdgelessSelectionPlugin";
import { EdgelessDeletionPlugin } from "./plugins/EdgelessDeletionPlugin";
import { EdgelessMovementPlugin } from "./plugins/EdgelessMovementPlugin";
import { EdgelessTransformPlugin } from "./plugins/EdgelessTransformPlugin";
import {
  BlockSelectionNavigationPlugin,
  CaretNavigationPlugin,
  KeyboardBlockMovePlugin,
} from "./plugins/PageArrowPlugin";
import {
  BackwardBlockMergePlugin,
  BlockOutdentPlugin,
  EmptyBlockResetPlugin,
} from "./plugins/PageBackspacePlugin";
import { PageBlockSelectionPlugin } from "./plugins/PageBlockSelectionPlugin";
import { PageCollapsePlugin } from "./plugins/PageCollapsePlugin";
import { ForwardBlockMergePlugin } from "./plugins/PageDeletePlugin";
import {
  PageDragBlockWrapper,
  PageDragPlugin,
  type PageDragPluginProps,
} from "./plugins/PageDragPlugin";
import { PageEnterPlugin } from "./plugins/PageEnterPlugin";
import { PageSlashCommandPlugin } from "./plugins/PageSlashCommandPlugin";
import { SelectionDeletionPlugin } from "./plugins/SelectionDeletionPlugin";
import { applyIndentShortcut } from "./plugins/utils/indent";
import { EdgelessSurface } from "./surfaces/edgeless";
import { PageSurface } from "./surfaces/page";
import {
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
  type ReactEditorPlugin,
} from "./managers";

/**
 * Adapts a React component to the functional plugin lifecycle.
 *
 * Components remain useful for behavior implemented with React hooks, while
 * callers configure the editor exclusively through plugin functions.
 *
 * @param id - Stable plugin identity used for duplicate detection.
 * @param component - Headless or visual component mounted by EditorView.
 * @returns A creation-time React editor plugin.
 */
const componentPlugin = (
  id: string,
  component: ComponentType,
): ReactEditorPlugin => ({
  id,
  setup: (reactEditor) => {
    reactEditor.plugins.mount(component);
  },
});

/** @returns The built-in recursive outline surface for block mode. */
export const pageSurfacePlugin = (): ReactEditorPlugin => ({
  id: "surface.page",
  setup: (reactEditor) => {
    reactEditor.surfaces.register("block", PageSurface);
  },
});

/** @returns The built-in positioned-card surface for edgeless mode. */
export const edgelessSurfacePlugin = (): ReactEditorPlugin => ({
  id: "surface.edgeless",
  setup: (reactEditor) => {
    reactEditor.surfaces.register("edgeless", EdgelessSurface);
  },
});

/**
 * Installs CRDT-backed undo/redo and native contenteditable history suppression.
 *
 * @param options - Optional shortcut and restoration behavior.
 * @returns A mode-independent history plugin.
 */
export const historyPlugin = (options: HistoryPluginProps = {}): ReactEditorPlugin => {
  const History = () => <HistoryPlugin {...options} />;
  return componentPlugin("history", History);
};

/** @returns DOM-to-editor text and cross-block selection synchronization. */
export const textSelectionPlugin = (): ReactEditorPlugin => componentPlugin("selection.text", TextSelectionPlugin);

/**
 * Installs structured and plain-text copy, cut, and paste handling.
 *
 * @param options - Clipboard serialization and paste behavior.
 * @returns A mode-independent clipboard plugin.
 */
export const clipboardPlugin = (options: ClipboardPluginProps = {}): ReactEditorPlugin => {
  const Clipboard = () => <ClipboardPlugin {...options} />;
  return componentPlugin("clipboard", Clipboard);
};

/** @returns Pointer and modifier-based whole-block selection for page mode. */
export const pageSelectionPlugin = (): ReactEditorPlugin => componentPlugin("selection.page", PageBlockSelectionPlugin);

/** @returns Visual-line and cross-block caret navigation for page mode. */
export const caretNavigationPlugin = (): ReactEditorPlugin =>
  componentPlugin("navigation.caret", CaretNavigationPlugin);

/** @returns Keyboard growth, shrink, and movement of page block selections. */
export const blockSelectionNavigationPlugin = (): ReactEditorPlugin =>
  componentPlugin("navigation.block-selection", BlockSelectionNavigationPlugin);

/** @returns Alt+Shift structural movement for eligible page blocks. */
export const keyboardBlockMovePlugin = (): ReactEditorPlugin =>
  componentPlugin("block.keyboard-move", KeyboardBlockMovePlugin);

/** @returns Enter-driven block splitting and creation in editable content. */
export const blockCreationPlugin = (): ReactEditorPlugin => componentPlugin("block.create", PageEnterPlugin);

/**
 * Installs backward and forward boundary merges as one semantic plugin.
 *
 * @returns Page-only behavior for Backspace at start and Delete at end.
 */
export const blockMergePlugin = (): ReactEditorPlugin => {
  const Merge = () => <><BackwardBlockMergePlugin /><ForwardBlockMergePlugin /></>;
  return componentPlugin("block.merge", Merge);
};

/** @returns Backspace/Delete removal for expanded structural selections. */
export const selectionDeletionPlugin = (): ReactEditorPlugin =>
  componentPlugin("selection.delete", SelectionDeletionPlugin);

/** @returns Backspace-at-start outdent behavior for nested page blocks. */
export const blockOutdentPlugin = (): ReactEditorPlugin =>
  componentPlugin("block.outdent-at-start", BlockOutdentPlugin);

/** @returns Reset of the first empty custom block to the default paragraph. */
export const emptyBlockResetPlugin = (): ReactEditorPlugin =>
  componentPlugin("block.reset-empty", EmptyBlockResetPlugin);

/** Shortcut configuration for structural indentation. */
export interface IndentPluginOptions {
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
 * @returns A functional plugin with two stable keyboard binding IDs.
 */
export const indentPlugin = (options: IndentPluginOptions = {}): ReactEditorPlugin => {
  const indentKeys = options.indentKeys ?? BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockIndent]!;
  const outdentKeys = options.outdentKeys ?? BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockOutdent]!;
  return {
    id: "block.indent",
    setup: (reactEditor) => {
      reactEditor.events.bind({
        id: KEYBOARD_BINDING_IDS.blockIndent,
        keys: indentKeys,
      }, ({ editor, root, event }) => applyIndentShortcut(
        editor,
        reactEditor.selection,
        root,
        event,
        false,
      ));
      reactEditor.events.bind({
        id: KEYBOARD_BINDING_IDS.blockOutdent,
        keys: outdentKeys,
      }, ({ editor, root, event }) => applyIndentShortcut(
        editor,
        reactEditor.selection,
        root,
        event,
        true,
      ));
    },
  };
};

/** @returns Page-only persisted collapse controls and keyboard actions. */
export const collapsePlugin = (): ReactEditorPlugin => componentPlugin("block.collapse", PageCollapsePlugin);

/** @returns Root-card click, toggle, and rectangle selection in edgeless mode. */
export const edgelessSelectionPlugin = (): ReactEditorPlugin => componentPlugin("selection.edgeless", EdgelessSelectionPlugin);

/** @returns Atomic Backspace/Delete removal of selected edgeless roots. */
export const edgelessDeletionPlugin = (): ReactEditorPlugin =>
  componentPlugin("selection.edgeless-delete", EdgelessDeletionPlugin);

/** @returns One- or ten-pixel keyboard movement of selected canvas roots. */
export const edgelessMovementPlugin = (): ReactEditorPlugin =>
  componentPlugin("movement.edgeless", EdgelessMovementPlugin);

/** @returns Pointer drag and resize interactions for edgeless root cards. */
export const edgelessTransformPlugin = (): ReactEditorPlugin => componentPlugin("transform.edgeless", EdgelessTransformPlugin);

/** Page drag configuration excluding the wrapper-owned React children slot. */
export type PageDragOptions = Omit<PageDragPluginProps, "children">;

/**
 * Creates structural drag-and-drop behavior for both built-in modes.
 *
 * The editor wrapper owns dnd-kit's gesture runtime and overlay. Registered
 * block wrappers connect each recursively rendered row to that boundary. Keeping
 * these registrations together guarantees that a wrapper is never installed
 * without its required editor-wide context.
 *
 * @param options - Pointer activation and page drop-zone tuning.
 * @returns Functional React editor plugin installed by createReactEditor.
 */
export const pageDragPlugin = (options: PageDragOptions = {}): ReactEditorPlugin => {
  const DragBoundary = ({ children }: { readonly children?: ReactNode }) => (
    <PageDragPlugin {...options}>{children}</PageDragPlugin>
  );
  return {
    id: "drag.page",
    setup: (reactEditor) => {
      reactEditor.surfaces.registerEditorWrapper(DragBoundary);
      reactEditor.surfaces.registerBlockWrapper("block", PageDragBlockWrapper);
      reactEditor.surfaces.registerBlockWrapper("edgeless", PageDragBlockWrapper);
    },
  };
};

/**
 * Adds the inline command menu and generic structural block actions.
 *
 * Block-type conversion entries are registered separately by `registerBlock`.
 * This plugin owns only actions valid for arbitrary registered types.
 *
 * @returns A mode-independent slash popup and its core command registrations.
 */
export const slashCommandPlugin = (): ReactEditorPlugin => ({
  id: "slash.commands",
  setup: (reactEditor) => {
    const { editor } = reactEditor;
    reactEditor.plugins.mount(PageSlashCommandPlugin);
    const disposers = [
      // Clone the complete subtree while leaving persisted IDs for the store to generate.
      reactEditor.slashCommands.register({
        id: "block.duplicate",
        title: "Duplicate block",
        group: "Actions",
        keywords: ["copy", "clone"],
        isAvailable: ({ blockId }) => Boolean(editor.getBlock(blockId)),
        execute: ({ blockId }) => {
          const block = editor.getBlock(blockId);
          if (!block) return;
          const input = duplicateBlockInput(block);
          if (editor.mode.get() === "edgeless" && editor.getBlocks().some((root) => root.id === blockId) && input.layout) {
            input.layout = { ...input.layout, x: (input.layout.x ?? 0) + 24, y: (input.layout.y ?? 0) + 24 };
          }
          const duplicateId = editor.insertBlock(input, block.id);
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
        isAvailable: ({ blockId }) => Boolean(editor.getBlock(blockId)),
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
      // Collapse is page-only because edgeless deliberately renders all descendants.
      reactEditor.slashCommands.register({
        id: "block.collapse",
        title: "Collapse block",
        group: "Actions",
        keywords: ["fold", "hide"],
        isAvailable: ({ blockId }) => {
          const block = editor.getBlock(blockId);
          return editor.mode.get() === "block" && Boolean(block?.children.length && !editor.getBlockCollapsed(blockId));
        },
        execute: ({ blockId }) => editor.setBlockCollapsed(blockId, true),
      }),
      // Expansion is offered only when it has a visible effect in page mode.
      reactEditor.slashCommands.register({
        id: "block.expand",
        title: "Expand block",
        group: "Actions",
        keywords: ["unfold", "show"],
        isAvailable: ({ blockId }) => {
          const block = editor.getBlock(blockId);
          return editor.mode.get() === "block" && Boolean(block?.children.length && editor.getBlockCollapsed(blockId));
        },
        execute: ({ blockId }) => editor.setBlockCollapsed(blockId, false),
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
 * @returns Recursive, ID-free input preserving type, content, props, layout,
 * plugin data, and descendants.
 */
const duplicateBlockInput = (block: EditorBlock): EditorBlockInput => ({
  type: block.type,
  content: block.content,
  props: structuredClone(block.props),
  pluginData: structuredClone(block.pluginData),
  layout: structuredClone(block.layout),
  children: block.children.map(duplicateBlockInput),
});
