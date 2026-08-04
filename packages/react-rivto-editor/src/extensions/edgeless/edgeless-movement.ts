import type { ReactEditor } from "../../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { owningRootIds, translatedLayouts } from "./edgeless-geometry";
import { getEdgelessRuntime } from "./edgeless-runtime";

/** Moves selected canvas roots through eight exact arrow-key bindings. */
export function registerEdgelessMovement(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const selection = getEdgelessRuntime(reactEditor);

  const move = (dx: number, dy: number): boolean => {
    const items = selection.get().items;
    if (!items.length) return false;
    if (editor.commands.has("edgeless.selection.move")) {
      editor.execute("edgeless.selection.move", { dx, dy });
      return true;
    }
    const blocks = editor.blocks.getBlocks();
    const blockIds = items.filter((item) => item.kind === "block").map((item) => item.id);
    const patches = translatedLayouts(blocks, owningRootIds(blocks, blockIds), dx, dy);
    editor.batchUpdates(() => {
      patches.forEach(({ id, layout }) => editor.blocks.setBlockLayout(id, layout));
    });
    return true;
  };

  const bind = (id: string, dx: number, dy: number) => reactEditor.keyboard.register({
    id,
    keys: BUILTIN_KEYMAP[id],
    mode: "edgeless",
    when: ({ raw: event }) => {
      const target = event.target;
      return selection.get().active && selection.get().items.length > 0 &&
        target instanceof HTMLElement &&
        !target.isContentEditable &&
        !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName);
    },
  }, () => move(dx, dy));

  bind(KEYBOARD_BINDING_IDS.edgelessMoveLeft, -1, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveRight, 1, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveUp, 0, -1);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveDown, 0, 1);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastLeft, -10, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastRight, 10, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastUp, 0, -10);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastDown, 0, 10);
}
