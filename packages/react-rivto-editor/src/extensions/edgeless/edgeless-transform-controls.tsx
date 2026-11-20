import { useContext, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { ConnectorTransformPreview } from "./connector-transform-preview";
import { CanvasTransformControls } from "@chulane/rivto-edgeless/react";
import { EdgelessControlsAdapter } from "./edgeless-controls-adapter";
import { useElements } from "../../hooks";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import { SurfaceContext } from "../../surfaces/surface";
import { useEdgelessCanvas } from "../../surfaces/edgeless/edgeless-tools-context";
import { useEdgelessSelection } from "../built-ins/selection/edgeless-runtime";
import type { EdgelessTransformControlsProps } from "./types";

/**
 * Mounts controls for dragging selected HTML elements, resizing, and rotation.
 * The editor owns selection, persisted geometry, connector previews, and undo;
 * the independent canvas computes gesture geometry and keeps its controls outside the target.
 *
 * A single element with absolute geometry uses its renderer's controls; default
 * lines and the control box do not intercept pointer input for that selection.
 *
 * @param props - Panel-local transform controller installed by the edgeless extension.
 * @param props.controller - Supplies move targets and previews or commits gestures for the panel.
 * @returns Controls in the canvas plane, or nothing outside an eligible selection.
 */
export function EdgelessTransformControls({ controller }: EdgelessTransformControlsProps) {
  const { reactPanel: panel } = useReactPanelContext();
  const inputRoot = useSyncExternalStore(
    panel.subscribeAvailability,
    () => panel.inputRoot,
    () => undefined,
  );
  const inputRegistration = useSyncExternalStore(
    panel.subscribeAvailability,
    () => panel.inputRegistration,
    () => undefined,
  );
  const mode = useContext(SurfaceContext);
  const canvas = useEdgelessCanvas();
  const selection = useEdgelessSelection();
  const elements = useElements();
  const id = selection.items.length === 1 ? selection.items[0] : undefined;
  const element = id ? panel.elements.getElementNode(id) : undefined;
  const groupRotation = element?.type === "group" ? Number(element.props.rotation) || 0 : undefined;
  const adapter = useMemo(
    () =>
      new EdgelessControlsAdapter(
        controller,
        panel,
        inputRoot,
        selection.items,
        groupRotation,
        inputRegistration,
      ),
    [controller, panel, inputRoot, inputRegistration, selection.items, groupRotation],
  );
  useLayoutEffect(() => {
    canvas?.setSelection(selection.items);
  }, [canvas, selection.items, elements]);
  if (mode !== "edgeless" || !canvas) {
    return null;
  }
  return (
    <>
      <CanvasTransformControls canvas={canvas} adapter={adapter} />
      <ConnectorTransformPreview controller={controller} />
    </>
  );
}
