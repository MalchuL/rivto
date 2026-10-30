import { useCanvasViewportLayers } from "@chulane/rivto-edgeless/react";
import { useContext, useLayoutEffect, useMemo } from "react";
import { CanvasTransformControls } from "@chulane/rivto-edgeless/react";
import { EdgelessControlsAdapter } from "./edgeless-controls-adapter";
import { useEditorRoot, useReactPanel, useElements } from "../../hooks";
import { SurfaceContext } from "../../surfaces/surface";
import { useEdgelessCanvas } from "../../surfaces/edgeless/edgeless-tools-context";
import { useEdgelessSelection } from "../built-ins/selection/edgeless-runtime";
import type { EdgelessTransformController } from "./edgeless-transform";

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
export function EdgelessTransformControls({
  controller,
}: {
  readonly controller: EdgelessTransformController;
}) {
  const panel = useReactPanel();
  const { element: root } = useEditorRoot();
  const mode = useContext(SurfaceContext);
  const canvas = useEdgelessCanvas();
  const selection = useEdgelessSelection();
  const elements = useElements();
  const plane = useCanvasViewportLayers()?.plane;
  const id = selection.items.length === 1 ? selection.items[0] : undefined;
  const element = id ? panel.elements.getElementNode(id) : undefined;
  const groupRotation = element?.type === "group" ? Number(element.props.rotation) || 0 : undefined;
  const adapter = useMemo(
    () =>
      new EdgelessControlsAdapter(controller, panel, root, plane, selection.items, groupRotation),
    [controller, panel, root, plane, selection.items, groupRotation],
  );
  useLayoutEffect(() => {
    canvas?.setSelection(selection.items);
  }, [canvas, selection.items, elements]);
  if (mode !== "edgeless" || !canvas || !plane) {
    return null;
  }
  return <CanvasTransformControls canvas={canvas} plane={plane} adapter={adapter} />;
}
