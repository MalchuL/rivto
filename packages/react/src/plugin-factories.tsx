import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import { ClipboardPlugin, type ClipboardPluginProps } from "./plugins/clipboard-plugin";
import { HistoryPlugin, type HistoryPluginProps } from "./plugins/history-plugin";
import { TextSelectionPlugin } from "./plugins/text-selection-plugin";
import { EdgelessSelectionPlugin } from "./plugins/EdgelessSelectionPlugin";
import { EdgelessTransformPlugin } from "./plugins/EdgelessTransformPlugin";
import { PageArrowPlugin } from "./plugins/PageArrowPlugin";
import { PageBackspacePlugin } from "./plugins/PageBackspacePlugin";
import { PageBlockSelectionPlugin } from "./plugins/PageBlockSelectionPlugin";
import { PageCollapsePlugin } from "./plugins/PageCollapsePlugin";
import { PageDeletePlugin } from "./plugins/PageDeletePlugin";
import { PageDragPlugin, type PageDragPluginProps } from "./plugins/PageDragPlugin";
import { PageEnterPlugin } from "./plugins/PageEnterPlugin";
import { PageSlashCommandPlugin } from "./plugins/PageSlashCommandPlugin";
import { applyIndentShortcut } from "./plugins/utils/indent";
import { EdgelessSurface } from "./surfaces/edgeless";
import { PageSurface } from "./surfaces/page";
import type { ReactEditorPlugin } from "./react-editor";

const componentPlugin = (
  id: string,
  component: ComponentType,
  mode?: "block" | "edgeless" | readonly ("block" | "edgeless")[],
): ReactEditorPlugin => ({ id, setup: ({ mount }) => { mount(component, mode); } });

export const pageSurfacePlugin = (): ReactEditorPlugin => ({
  id: "surface.page",
  setup: ({ registerSurface }) => { registerSurface("block", PageSurface); },
});

export const edgelessSurfacePlugin = (): ReactEditorPlugin => ({
  id: "surface.edgeless",
  setup: ({ registerSurface }) => { registerSurface("edgeless", EdgelessSurface); },
});

export const historyPlugin = (options: HistoryPluginProps = {}): ReactEditorPlugin => {
  const History = () => <HistoryPlugin {...options} />;
  return componentPlugin("history", History);
};
export const textSelectionPlugin = (): ReactEditorPlugin => componentPlugin("selection.text", TextSelectionPlugin);

export const clipboardPlugin = (options: ClipboardPluginProps = {}): ReactEditorPlugin => {
  const Clipboard = () => <ClipboardPlugin {...options} />;
  return componentPlugin("clipboard", Clipboard);
};

export const pageSelectionPlugin = (): ReactEditorPlugin => componentPlugin("selection.page", PageBlockSelectionPlugin, "block");
export const caretNavigationPlugin = (): ReactEditorPlugin => componentPlugin("navigation.caret", PageArrowPlugin, "block");
export const blockCreationPlugin = (): ReactEditorPlugin => componentPlugin("block.create", PageEnterPlugin);

export const blockMergePlugin = (): ReactEditorPlugin => {
  const Merge = () => <><PageBackspacePlugin behavior="merge" /><PageDeletePlugin behavior="merge" /></>;
  return componentPlugin("block.merge", Merge, "block");
};

export const selectionDeletionPlugin = (): ReactEditorPlugin => {
  const DeleteSelection = () => <><PageBackspacePlugin behavior="selection" /><PageDeletePlugin behavior="selection" /></>;
  return componentPlugin("selection.delete", DeleteSelection, "block");
};

export interface IndentPluginOptions {
  readonly indentKeys?: readonly string[];
  readonly outdentKeys?: readonly string[];
}

export const indentPlugin = (options: IndentPluginOptions = {}): ReactEditorPlugin => {
  const indentKeys = options.indentKeys ?? ["Tab"];
  const outdentKeys = options.outdentKeys ?? ["Shift+Tab"];
  return {
    id: "block.indent",
    setup: ({ keyboard }) => {
      keyboard.bind(indentKeys, ({ editor, root, event }) => applyIndentShortcut(editor, root, event, false));
      keyboard.bind(outdentKeys, ({ editor, root, event }) => applyIndentShortcut(editor, root, event, true));
    },
  };
};

export const collapsePlugin = (): ReactEditorPlugin => componentPlugin("block.collapse", PageCollapsePlugin, "block");
export const edgelessSelectionPlugin = (): ReactEditorPlugin => componentPlugin("selection.edgeless", EdgelessSelectionPlugin, "edgeless");
export const edgelessTransformPlugin = (): ReactEditorPlugin => componentPlugin("transform.edgeless", EdgelessTransformPlugin, "edgeless");

export type PageDragOptions = Omit<PageDragPluginProps, "children">;

export const pageDragPlugin = (options: PageDragOptions = {}): ReactEditorPlugin => {
  const DragProvider = ({ children }: { readonly children?: ReactNode }) => (
    <PageDragPlugin {...options}>{children}</PageDragPlugin>
  );
  return { id: "drag.page", setup: ({ provide }) => { provide(DragProvider); } };
};

/** Adds the inline menu and the generic structural slash actions. */
export const slashCommandPlugin = (): ReactEditorPlugin => ({
  id: "slash.commands",
  setup: ({ editor, mount }) => {
    mount(PageSlashCommandPlugin);
    const disposers = [
      editor.slashCommands.register({
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
          editor.execute("selection.set", { selection: [{
            type: "block",
            blockIds: [duplicateId],
            anchorBlockId: duplicateId,
            focusBlockId: duplicateId,
          }] });
        },
      }),
      editor.slashCommands.register({
        id: "block.delete",
        title: "Delete block",
        group: "Actions",
        keywords: ["remove"],
        isAvailable: ({ blockId }) => Boolean(editor.getBlock(blockId)),
        execute: ({ blockId }) => {
          editor.execute("selection.set", { selection: [{
            type: "block",
            blockIds: [blockId],
            anchorBlockId: blockId,
            focusBlockId: blockId,
          }] });
          editor.deleteSelection();
        },
      }),
      editor.slashCommands.register({
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
      editor.slashCommands.register({
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
    return () => disposers.reverse().forEach((dispose) => dispose());
  },
});

const duplicateBlockInput = (block: EditorBlock): EditorBlockInput => ({
  type: block.type,
  content: block.content,
  props: structuredClone(block.props),
  pluginData: structuredClone(block.pluginData),
  layout: structuredClone(block.layout),
  children: block.children.map(duplicateBlockInput),
});
