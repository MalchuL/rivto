import {
  DEFAULT_BLOCK_TYPE,
  type RivtoEditorApi,
} from "@chulane/rivto";
import { duplicateBlockInput } from "./block-utils";
import {
  COUNTER_BLOCK_TYPE,
  counterBlockDefinition,
  SLIDER_BLOCK_TYPE,
  sliderBlockDefinition,
} from "./custom-block-definitions";

export { duplicateBlockInput } from "./block-utils";
export {
  COUNTER_BLOCK_TYPE,
  counterBlockDefinition,
  SLIDER_BLOCK_TYPE,
  sliderBlockDefinition,
} from "./custom-block-definitions";

/**
 * Installs the demo's custom data definitions and slash actions.
 *
 * Rendering is deliberately absent: PageBlock's local renderer map remains the
 * page surface's policy boundary. This installer demonstrates that application
 * plugins can add validated data and commands without making Rivto depend on
 * React components or a renderer registry.
 */
export function installCustomBlocks(editor: RivtoEditorApi): () => void {
  const disposers = [
    editor.defineBlock(sliderBlockDefinition),
    editor.defineBlock(counterBlockDefinition),
  ];

  const registerType = (type: string, title: string, keywords: string[]) => editor.slashCommands.register({
    id: `type.${type}`,
    title,
    group: "Turn into",
    keywords,
    isAvailable: ({ blockId }) => editor.getBlock(blockId)?.type !== type,
    execute: ({ blockId }) => editor.setBlockType(blockId, type),
  });

  disposers.push(
    registerType(DEFAULT_BLOCK_TYPE, "Markdown", ["paragraph", "text"]),
    registerType(SLIDER_BLOCK_TYPE, "Slider", ["range", "value"]),
    registerType(COUNTER_BLOCK_TYPE, "Counter", ["count", "button"]),
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
  );

  return () => disposers.reverse().forEach((dispose) => dispose());
}
