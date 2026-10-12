import { EDITOR_CONTROL_SELECTOR } from "../../constants";
import type { PanelAPI } from "../../panels/types";
import type { ReactEditorApi } from "../../editor/types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { getEdgelessRuntime } from "../built-ins/selection/edgeless-runtime";

/** Moves selected canvas roots through eight exact arrow-key bindings. */
export function registerEdgelessMovement(reactEditor: ReactEditorApi): void {
  const selection = getEdgelessRuntime(reactEditor);

  const move = (panel: PanelAPI, dx: number, dy: number): boolean => {
    const items = getEdgelessRuntime(panel).get().items;
    if (!items.length) return false;
    if (reactEditor.document.commands.has("edgeless.selection.move")) {
      reactEditor.document.commands.execute("edgeless.selection.move", { panel, payload: { dx, dy } });
    } else {
      const updates = items.flatMap((id) => {
        const element = panel.elements.getElementNode(id);
        return element ? [{ id, patch: { frame: { x: element.frame.x + dx, y: element.frame.y + dy } } }] : [];
      });
      if (updates.length) panel.elements.updateElements(updates);
    }
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
        !target.closest(EDITOR_CONTROL_SELECTOR) &&
        !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName);
    },
  }, ({ panel }) => move(panel, dx, dy));

  bind(KEYBOARD_BINDING_IDS.edgelessMoveLeft, -1, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveRight, 1, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveUp, 0, -1);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveDown, 0, 1);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastLeft, -10, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastRight, 10, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastUp, 0, -10);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastDown, 0, 10);
}
