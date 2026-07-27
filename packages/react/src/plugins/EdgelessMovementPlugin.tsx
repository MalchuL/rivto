import type { EdgelessSelection } from "@chulane/rivto";
import {
  useEditor,
  useKeyboardEvent,
} from "../hooks";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";
import { translatedLayouts } from "./utils/edgeless-geometry";

/** Moves selected canvas roots through eight exact arrow-key bindings. */
export function EdgelessMovementPlugin() {
  const editor = useEditor();

  const move = (dx: number, dy: number): boolean => {
    const selection = editor.selection.get()
      .find((item): item is EdgelessSelection => item.type === "edgeless");
    if (!selection) return false;
    const patches = translatedLayouts(editor.getBlocks(), selection.blockIds, dx, dy);
    editor.document.transact(() => {
      patches.forEach(({ id, layout }) => editor.setBlockLayout(id, layout));
    });
    return true;
  };

  const bind = (id: string, dx: number, dy: number) => useKeyboardEvent({
    id,
    keys: BUILTIN_KEYMAP[id],
    mode: "edgeless",
    when: ({ selection, event }) => {
      const target = event.target;
      return selection.some((item) => item.type === "edgeless") &&
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

  return null;
}
