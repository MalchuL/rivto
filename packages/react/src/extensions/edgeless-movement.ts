import type { BlockSelection } from "@chulane/rivto";
import type { ReactEditor } from "../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";
import { owningRootIds, translatedLayouts } from "./edgeless-geometry";

/** Moves selected canvas roots through eight exact arrow-key bindings. */
export function registerEdgelessMovement(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;

  const move = (dx: number, dy: number): boolean => {
    const selection = editor.selection.get()
      .find((item): item is BlockSelection => item.type === "block");
    if (!selection) return false;
    const blocks = editor.getBlocks();
    const patches = translatedLayouts(blocks, owningRootIds(blocks, selection.blockIds), dx, dy);
    editor.batchUpdates(() => {
      patches.forEach(({ id, layout }) => editor.setBlockLayout(id, layout));
    });
    return true;
  };

  const bind = (id: string, dx: number, dy: number) => reactEditor.keyboard.register({
    id,
    keys: BUILTIN_KEYMAP[id],
    mode: "edgeless",
    when: ({ selection, raw: event }) => {
      const target = event.target;
      return selection.some((item) => item.type === "block") &&
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
