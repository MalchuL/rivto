import type { EditorRuntime } from "../../editor/editor-runtime";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { getEdgelessRuntime } from "../built-ins/selection/edgeless-runtime";

/** Moves selected canvas roots through eight exact arrow-key bindings. */
export function registerEdgelessMovement(editorRuntime: EditorRuntime): void {
  const selection = getEdgelessRuntime(editorRuntime);

  const move = (dx: number, dy: number): boolean => {
    const items = selection.get().items;
    if (!items.length) return false;
    if (editorRuntime.commands.has("edgeless.selection.move")) {
      editorRuntime.commands.execute("edgeless.selection.move", { dx, dy });
    } else {
      const updates = items.flatMap((id) => {
        const element = editorRuntime.elements.getElement(id);
        return element ? [{ id, patch: { frame: { x: element.frame.x + dx, y: element.frame.y + dy } } }] : [];
      });
      if (updates.length) editorRuntime.elements.updateElements(updates);
    }
    return true;
  };

  const bind = (id: string, dx: number, dy: number) => editorRuntime.keyboard.register({
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
