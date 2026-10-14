import type { ReactEditorExtension } from "../../../managers";
import { BlockHandle } from "../../../components/block-handle/block-handle";
import { registerBlockBackground } from "./colors";

/**
 * Creates the extension installing universal block handles and background colors.
 *
 * Setup registers the left-top handle slot, the background property and custom
 * swatches, and separators for the built-in action groups. Opening a block uses
 * the host's BlockHandleContext callback. Dragging is optional and supplied by
 * pageDragExtension; this extension does not install drag sensors.
 *
 * @returns The block.handle extension, with registrations owned by its setup lifecycle.
 */
export function blockHandleExtension(): ReactEditorExtension {
  return {
    id: "block.handle",
    /**
     * Registers the handle slot, background controls, and action-group separators.
     *
     * @param editor - Runtime owning these extension-scoped registrations.
     * @returns No value; the registries own disposal through the extension lifecycle.
     */
    setup: (editor) => {
      editor.surfaces.registerBlockSlot({
        position: "left-top",
        priority: 200,
        component: BlockHandle,
      });
      registerBlockBackground(editor);
      for (const [id, order] of [
        ["format", 15],
        ["outline", 50],
        ["clipboard", 65],
        ["delete", 95],
      ] as const) {
        editor.blockContextMenu.register({
          id: `separator.${id}`,
          title: id,
          kind: "separator",
          order,
        });
      }
    },
  };
}
