import { EDITOR_CONTROL_SELECTOR } from "../../constants";
import type { EdgelessMovementPanel } from "./types";
import type { ReactEditorExtensionApi } from "../../editor/types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { getEdgelessRuntime } from "../built-ins/selection/edgeless-runtime";

/** Moves selected canvas roots through eight exact arrow-key bindings. */
export function registerEdgelessMovement(reactEditor: ReactEditorExtensionApi): void {
  const selection = getEdgelessRuntime(reactEditor);

  const move = (reactPanel: EdgelessMovementPanel, dx: number, dy: number): boolean => {
    const items = getEdgelessRuntime(reactPanel).get().items;
    if (!items.length) {
      return false;
    }
    if (reactEditor.commands.has("edgeless.selection.move")) {
      reactEditor.commands.execute("edgeless.selection.move", { reactPanel, payload: { dx, dy } });
    } else {
      const updates = items.flatMap((id) => {
        const element = reactPanel.elements.getElementNode(id);
        return element
          ? [{ id, patch: { frame: { x: element.frame.x + dx, y: element.frame.y + dy } } }]
          : [];
      });
      if (updates.length) {
        reactPanel.elements.updateElements(updates);
      }
    }
    return true;
  };

  const bind = (id: string, dx: number, dy: number) =>
    reactEditor.keyboard.register(
      {
        id,
        keys: BUILTIN_KEYMAP[id],
        mode: "edgeless",
        when: ({ readTarget, targetHasAncestor }) => {
          if (!selection.get().active || selection.get().items.length === 0) {
            return false;
          }
          const target = readTarget();
          return Boolean(
            target?.isCurrentRealmHTMLElement &&
            !target.isEditable &&
            !targetHasAncestor(EDITOR_CONTROL_SELECTOR) &&
            !target.isFormControl &&
            !target.isLink,
          );
        },
      },
      ({ reactPanel }) => move(reactPanel, dx, dy),
    );

  bind(KEYBOARD_BINDING_IDS.edgelessMoveLeft, -1, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveRight, 1, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveUp, 0, -1);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveDown, 0, 1);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastLeft, -10, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastRight, 10, 0);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastUp, 0, -10);
  bind(KEYBOARD_BINDING_IDS.edgelessMoveFastDown, 0, 10);
}
