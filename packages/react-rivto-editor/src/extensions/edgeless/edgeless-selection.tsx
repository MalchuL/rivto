import { EdgelessSelectionController } from "./edgeless-selection-controller";
import { useContext } from "react";
import { SurfaceContext } from "../../surfaces/surface";
/**
 * Pointer gestures for whole-object edgeless selection, including marquee.
 *
 * The marquee rectangle is a DOM node updated from pointermove without React
 * state. Object rects and the group-parent index are captured once when the
 * gesture crosses slop so later moves only intersect and call `selection.set`,
 * which no-ops when membership is unchanged.
 */
import { useEffect, useMemo } from "react";
import { useEditorRoot, useKeyboardEvent, useReactPanel } from "../../hooks";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { getEdgelessRuntime } from "../built-ins/selection/edgeless-runtime";
/**
 * Owns whole-block selection on the edgeless canvas.
 *
 * Primary-click can select any nested block shell. Card-background and rectangle
 * gestures select root cards because only roots are independent canvas
 * objects. Layout extensions project arbitrary selected blocks back to their
 * owning roots when a canvas move is requested.
 *
 * @returns Null; the marquee rectangle is an imperative DOM node.
 */
export function EdgelessInteractionOverlay() {
  const reactPanel = useReactPanel();
  const selection = getEdgelessRuntime(reactPanel);
  const mode = useContext(SurfaceContext);
  const { element: root } = useEditorRoot();
  const controller = useMemo(
    () =>
      root ? new EdgelessSelectionController(root, reactPanel.elements, selection) : undefined,
    [root, reactPanel.elements, selection],
  );
  useEffect(() => controller?.install(reactPanel.events), [controller, reactPanel.events]);
  useEffect(() => {
    if (mode !== "edgeless") {
      controller?.marquee.stop();
    }
  }, [mode, controller]);

  useKeyboardEvent(
    {
      id: KEYBOARD_BINDING_IDS.edgelessSelectionClear,
      keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessSelectionClear],
      mode: "edgeless",
      when: ({ root }) =>
        !root.dataset.transforming && selection.get().active && selection.get().items.length > 0,
    },
    () => {
      if (!root) {
        return false;
      }
      if (!selection.get().items.length) {
        return false;
      }
      selection.clear();
      root.focus({ preventScroll: true });
      return true;
    },
  );

  return null;
}
