/**
 * Public built-in extension catalog.
 *
 * Factories hide hook-host components and give applications a declarative,
 * creation-time extension list with stable IDs and focused configuration.
 *
 * @module
 */
import type {
  EditorBlock as Block,
  EditorBlockInput as BlockInput,
} from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import { registerClipboard, type ClipboardExtensionOptions } from "./clipboard";
import { registerHistory, type HistoryExtensionOptions } from "./history";
import { registerTextSelection } from "./text-selection";
import { EdgelessInteractionOverlay } from "./edgeless-selection";
import { registerEdgelessDeletion } from "./edgeless-deletion";
import { registerEdgelessMovement } from "./edgeless-movement";
import { registerEdgelessTransform } from "./edgeless-transform";
import {
  registerBlockSelectionNavigation,
  registerCaretNavigation,
  registerKeyboardBlockMove,
} from "./page-navigation";
import {
  registerBackwardBlockMerge,
  registerBlockOutdent,
  registerEmptyBlockReset,
} from "./page-backspace";
import { registerBlockSelection } from "./block-selection";
import { registerCollapse } from "./page-collapse";
import { registerForwardBlockMerge } from "./page-delete";
import {
  PageDragBlockWrapper,
  PageDragProvider,
  type PageDragExtensionOptions,
} from "./page-drag";
import { registerBlockCreation } from "./page-enter";
import { SlashMenu } from "./slash-menu";
import { registerSelectionDeletion } from "./selection-deletion";
import { TrailingBlock } from "./trailing-block";
import { applyIndentShortcut } from "./indent";
import { EdgelessSurface } from "../surfaces/edgeless";
import { PageSurface } from "../surfaces/page";
import {
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
  type ReactBlockRegistration,
  type ReactEditorExtension,
} from "../managers";

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
export const edgelessSurfaceExtension = (): ReactEditorExtension => ({
  id: "surface.edgeless",
  setup: (reactEditor) => {
    reactEditor.surfaces.register("edgeless", EdgelessSurface);
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

/** @returns Visual-line and cross-block caret navigation for page mode. */
export const caretNavigationExtension = (): ReactEditorExtension =>
  ({ id: "navigation.caret", setup: registerCaretNavigation });

/** @returns Keyboard growth, shrink, and movement of page block selections. */
export const blockSelectionNavigationExtension = (): ReactEditorExtension =>
  ({ id: "navigation.block-selection", setup: registerBlockSelectionNavigation });

/** @returns Alt+Shift structural movement for eligible page blocks. */
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
 * @returns Page-only behavior for Backspace at start and Delete at end.
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
 * @returns A page-only visual extension mounted through the normal lifecycle.
 */
export const trailingBlockExtension = (count: number): ReactEditorExtension => {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Trailing block count must be a positive integer");
  }
  return componentExtension("block.trailing-create", () => <TrailingBlock count={count} />);
};

/** @returns Backspace-at-start outdent behavior for nested page blocks. */
export const blockOutdentExtension = (): ReactEditorExtension =>
  ({ id: "block.outdent-at-start", setup: registerBlockOutdent });

/** @returns Reset of the first empty custom block to the default paragraph. */
export const emptyBlockResetExtension = (): ReactEditorExtension =>
  ({ id: "block.reset-empty", setup: registerEmptyBlockReset });

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
      reactEditor.events.register({
        id: KEYBOARD_BINDING_IDS.blockIndent,
        keys: indentKeys,
      }, ({ editor, root, raw: event }) => applyIndentShortcut(
        editor,
        reactEditor.selection,
        root,
        event,
        false,
      ));
      reactEditor.events.register({
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

/** @returns Page-only persisted collapse controls and keyboard actions. */
export const collapseExtension = (): ReactEditorExtension => ({
  id: "block.collapse",
  setup: registerCollapse,
});

/** @returns Root-card click, toggle, and rectangle selection in edgeless mode. */
export const edgelessSelectionExtension = (): ReactEditorExtension =>
  componentExtension("selection.edgeless", EdgelessInteractionOverlay);

/** @returns Atomic Backspace/Delete removal of selected canvas blocks. */
export const edgelessDeletionExtension = (): ReactEditorExtension =>
  ({ id: "selection.edgeless-delete", setup: registerEdgelessDeletion });

/** @returns One- or ten-pixel keyboard movement of selected canvas roots. */
export const edgelessMovementExtension = (): ReactEditorExtension =>
  ({ id: "movement.edgeless", setup: registerEdgelessMovement });

/** @returns Pointer drag and resize interactions for edgeless root cards. */
export const edgelessTransformExtension = (): ReactEditorExtension => ({
  id: "transform.edgeless",
  setup: registerEdgelessTransform,
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
          return editor.mode.get() === "block" && Boolean(block?.children.length && !block.collapsed);
        },
        execute: ({ blockId }) => editor.updateBlock(blockId, { collapsed: true }),
      }),
      // Expansion is offered only when it has a visible effect in page mode.
      reactEditor.slashCommands.register({
        id: "block.expand",
        title: "Expand block",
        group: "Actions",
        keywords: ["unfold", "show"],
        isAvailable: ({ blockId }) => {
          const block = editor.getBlock(blockId);
          return editor.mode.get() === "block" && Boolean(block?.children.length && block.collapsed);
        },
        execute: ({ blockId }) => editor.updateBlock(blockId, { collapsed: false }),
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
 * extension data, and descendants.
 */
const duplicateBlockInput = (block: Block): BlockInput => ({
  type: block.type,
  content: block.content,
  props: structuredClone(block.props),
  pluginData: structuredClone(block.pluginData),
  layout: structuredClone(block.layout),
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

/**
 * Complete built-in editing behavior used by normal Rivto applications.
 *
 * @param trailingBlockCount - Number of page-end insertion targets.
 * @returns The complete built-in extension preset.
 */
export const standardPreset = (trailingBlockCount = 3): ReactEditorExtension => {
  const extensions = [
    pageSurfaceExtension(),
    edgelessSurfaceExtension(),
    historyExtension(),
    textSelectionExtension(),
    slashCommandExtension(),
    clipboardExtension(),
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
