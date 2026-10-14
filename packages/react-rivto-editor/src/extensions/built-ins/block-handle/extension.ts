import type { ReactEditorExtension } from "../../../managers";
import { BlockHandle } from "../../../components/block-handle/block-handle";
import { registerBlockBackground } from "./colors";

/** Installs independent block handles and background colors; dragging is supplied by pageDragExtension. */
export function blockHandleExtension(): ReactEditorExtension {
  return {
    id: "block.handle",
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
