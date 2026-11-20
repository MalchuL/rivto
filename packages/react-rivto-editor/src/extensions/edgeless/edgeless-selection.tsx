import { EdgelessSelectionController } from "./edgeless-selection-controller";
import { createEdgelessMarquee } from "./browser/create-edgeless-marquee";
import type { CanvasApi } from "@chulane/rivto-edgeless";
import type { EdgelessSelectionRuntime } from "../built-ins/selection/edgeless-runtime";
import type { EdgelessMarqueePanel } from "./types";
import { canRunEdgelessKeyboardAction } from "./edgeless-keyboard-scope";
import { useContext } from "react";
import { useEdgelessCanvas } from "../../surfaces/edgeless/edgeless-tools-context";
import { SurfaceContext } from "../../surfaces/surface";
/**
 * Pointer gestures for whole-object edgeless selection, including marquee.
 *
 * The marquee rectangle is a DOM node updated from pointermove without React
 * state. Object rects and the group-parent index are captured once when the
 * gesture crosses slop so later moves only intersect and call `selection.set`,
 * which no-ops when membership is unchanged.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useKeyboardEvent } from "../../hooks";
import { useEditorRootIdentity } from "../../hooks/editor/use-editor-root-identity";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
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
 * @throws Propagates occurrence identity and marquee creation failures.
 */
export function EdgelessInteractionOverlay() {
  const { reactPanel } = useReactPanelContext();
  const selection = getEdgelessRuntime(reactPanel);
  const canvas = useEdgelessCanvas();
  const mode = useContext(SurfaceContext);
  const controller = useEdgelessSelectionController(reactPanel, selection, canvas);
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
      when: ({ inputRoot }) =>
        canRunEdgelessKeyboardAction(reactPanel, inputRoot) &&
        selection.get().active &&
        selection.get().items.length > 0,
    },
    ({ inputRoot, inputRegistration }) => {
      if (!inputRegistration.isCurrent(inputRoot)) {
        return false;
      }
      if (!selection.get().items.length) {
        return false;
      }
      selection.clear();
      if (inputRegistration.isCurrent(inputRoot)) {
        inputRoot.focus();
      }
      return true;
    },
  );

  return null;
}

/**
 * Creates and installs selection for the current mounted occurrence.
 *
 * A replacement Root gets a new marquee and controller even when it reuses the
 * same element. Effect cleanup releases only the previous controller's resources.
 *
 * @param reactPanel - Occurrence state and borrowed event registration.
 * @param selection - Host selection reads and writes for the current panel.
 * @param canvas - Surface-owned geometry and coordinate conversion, when available.
 * @returns The controller for the matching attached Root, or undefined before attachment.
 * @throws Propagates occurrence identity, marquee creation, and registration failures.
 */
function useEdgelessSelectionController(
  reactPanel: EdgelessMarqueePanel,
  selection: Pick<EdgelessSelectionRuntime, "get" | "set" | "clear">,
  canvas: Pick<CanvasApi, "getElements" | "toViewport"> | null,
): EdgelessSelectionController | undefined {
  const rootIdentity = useEditorRootIdentity();
  const inputRoot = useSyncExternalStore(
    reactPanel.subscribeAvailability,
    () => reactPanel.inputRoot,
    () => undefined,
  );
  const inputRegistration = useSyncExternalStore(
    reactPanel.subscribeAvailability,
    () => reactPanel.inputRegistration,
    () => undefined,
  );
  const controller = useMemo(
    () =>
      rootIdentity &&
      inputRoot?.isAttached() &&
      inputRegistration?.isCurrent(inputRoot) &&
      inputRoot.getElementIdentity?.() === rootIdentity &&
      inputRoot.isAttached() &&
      reactPanel.inputRoot === inputRoot
        ? new EdgelessSelectionController(
            createEdgelessMarquee(inputRoot, reactPanel.elements, selection, canvas),
            inputRoot,
            selection,
            inputRegistration,
          )
        : undefined,
    [rootIdentity, inputRoot, inputRegistration, reactPanel, selection, canvas],
  );
  useEffect(() => controller?.install(reactPanel.events), [controller, reactPanel.events]);
  return controller;
}
