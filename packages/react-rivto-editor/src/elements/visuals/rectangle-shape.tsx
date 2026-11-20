import { useRef, useState } from "react";
import { editorControlProps } from "../../constants";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import { useRectangleRadiusInput } from "./use-rectangle-radius-input";
import { RADIUS_HANDLE_CLASS, RectangleRadiusInput } from "./rectangle-radius-input";
import type {
  RectangleRadiusGesture,
  RectangleRadiusHandleProps,
  RectangleShapeProps,
} from "./types";

/**
 * Paints a rectangle with a local corner-radius draft and an accessible adjustment handle.
 *
 * Pointer movement changes only this renderer; release commits one property patch.
 * Escape, lost capture, blur and pointer cancellation discard the draft. Unmounting
 * removes the draft with the renderer. Keyboard arrows adjust one canvas unit at a
 * time; Home and End choose the visible radius limits. SVG coordinates account for
 * canvas zoom and element rotation. Creation previews never mount the control.
 *
 * @param props - Element snapshot and shared renderer interaction services.
 * @param props.fill - Resolved fill color, or none when disabled.
 * @param props.stroke - Resolved stroke color, or none when disabled.
 * @param props.strokeWidth - Non-scaling stroke thickness in screen pixels.
 * @returns Rectangle geometry and, when selected and not editing, a radius handle.
 */
export function RectangleShape(props: RectangleShapeProps) {
  const { element, operations, zoom, selected, editing, preview, fill, stroke, strokeWidth } =
    props;
  const [draft, setDraft] = useState<number | null>(null);
  const gesture = useRef<RectangleRadiusGesture | null>(null);
  const { reactPanel } = useReactPanelContext();
  const saved = Number(element.props.cornerRadius ?? 3);
  const scale = Math.max(zoom, 0.01);
  const size = Math.min(element.frame.width, element.frame.height);
  const maximum = Math.max(0, (size - Math.min(size * 0.9, strokeWidth / scale)) / 2);
  const radius = draft ?? saved;
  const offset = 8 / scale;

  const handlers = new RectangleRadiusInput({
    elementId: element.id,
    saved,
    maximum,
    radius,
    offset,
    draft,
    gesture,
    setDraft,
    operations,
  });
  const handle = useRectangleRadiusInput(reactPanel, selected && !editing && !preview, handlers);

  return (
    <>
      <rect
        width="100%"
        height="100%"
        rx={radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      {selected && !editing && !preview && (
        <RectangleRadiusHandle
          handle={handle}
          radius={radius}
          maximum={maximum}
          offset={offset}
          scale={scale}
        />
      )}
    </>
  );
}

/**
 * Renders the accessible radius handle at its current local position.
 *
 * @param props - Current bounded radius, scale, position and mounting ref.
 * @param props.handle - Ref used to attach normalized Root input.
 * @param props.radius - Current draft or saved radius in canvas units.
 * @param props.maximum - Maximum visible radius in canvas units.
 * @param props.offset - Handle offset in canvas units.
 * @param props.scale - Canvas zoom used to keep the handle visible.
 * @returns An SVG slider receiving its input through the mounted Root.
 */
function RectangleRadiusHandle({
  handle,
  radius,
  maximum,
  offset,
  scale,
}: RectangleRadiusHandleProps) {
  return (
    <circle
      {...editorControlProps}
      data-edgeless-ui="true"
      ref={handle}
      className={RADIUS_HANDLE_CLASS}
      role="slider"
      tabIndex={0}
      aria-label="Rectangle corner radius"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={maximum}
      aria-valuenow={Math.min(radius, maximum)}
      cx={Math.min(radius, maximum) + offset}
      cy={offset}
      r={5 / scale}
      vectorEffect="non-scaling-stroke"
    />
  );
}
