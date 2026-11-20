import {
  createElement,
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { ElementCreationPreview } from "../../../../elements/visuals/element-creation-preview";
import type { SnapGuide } from "../../../../elements/visuals/utils/geometry";
import { SnapGuides } from "../components/snap-guides";
import { PresetDragController } from "./preset-drag-controller";
import { subscribePresetDrag } from "./preset-drag-subscription";
import type { PresetDragOptions, PresetDragPreview } from "./types";

/**
 * Connects toolbar preset placement to surface presentation and cancellation.
 *
 * Mounts the registered renderer into a detached preview portal after four screen pixels
 * of movement. Subsequent pointer samples move its host through requestAnimationFrame
 * without inserting or updating document elements. Release over the canvas commits once;
 * a click only selects the placement tool. Escape, panel deactivation, Select/Pan and
 * unmount release capture, remove the ghost and cancel placement.
 *
 * @param props - Surface tool context, viewport snapping policy, attachment-bound
 * screen conversion and hit testing, and viewport scale factor (1 is 100%).
 * @param props.tools - Surface tool session and panel cancellation ownership.
 * @param props.viewport - Canvas state and Root input observations for the current occurrence.
 * @param props.coordinates - Coordinate conversion and hit testing bound to the current viewport attachment.
 * @param props.inputRoot - Current panel input attachment, when available.
 * @param props.rootIdentity - Identity of the mounted surface receiving the gesture.
 * @param props.zoom - Current world-to-screen scale.
 * @returns Preview portal and a toolbar pointer-start operation. Root observations
 * deliver movement, release and cancellation until the gesture ends.
 */
export function usePresetDrag({
  tools,
  viewport,
  coordinates,
  inputRoot,
  rootIdentity,
  zoom,
}: PresetDragOptions) {
  const id = useId();
  const [guides, setGuides] = useState<readonly SnapGuide[]>([]);
  const [preview, setPreview] = useState<PresetDragPreview | null>(null);
  // Preserve capture ownership while camera and attachment values change.
  const controller = useMemo(
    () =>
      new PresetDragController(
        tools,
        id,
        { viewport, coordinates, inputRoot, rootIdentity, zoom },
        setPreview,
        setGuides,
      ),
    [tools, id],
  );
  useLayoutEffect(() =>
    controller.update({ viewport, coordinates, inputRoot, rootIdentity, zoom }),
  );
  useEffect(
    () =>
      subscribePresetDrag(
        tools,
        controller.cancel,
        controller.isActive,
        controller.cancelIfToolChanged,
      ),
    [tools, controller, coordinates, viewport?.events],
  );
  return {
    preview: createElement(
      Fragment,
      null,
      createElement(SnapGuides, { guides }),
      preview &&
        preview.preview.render(
          createElement(ElementCreationPreview, {
            input: preview.input,
            frame: preview.frame,
            operations: tools.operations,
            zoom,
            style: { left: 0, top: 0, transform: "none", width: "100%", height: "100%" },
          }),
        ),
    ),
    startPresetDrag: controller.start,
  };
}
