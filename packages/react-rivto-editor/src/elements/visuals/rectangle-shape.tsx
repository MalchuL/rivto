import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ElementRenderProps } from "../../authoring";
import { elementControlProps } from "../../authoring/element-control";

/** Local radius draft and geometry used by the existing SVG control. */
interface RectangleRadiusState {
  readonly draft: number | null;
  readonly saved: number;
  readonly maximum: number;
  readonly radius: number;
  readonly offset: number;
  readonly scale: number;
  readonly setDraft: (value: number | null) => void;
  readonly commit: (value: number) => void;
}

/**
 * Updates the radius draft from a captured pointer in rectangle-local coordinates.
 *
 * @param event - Pointer movement received by the radius control.
 * @param state - Current draft, bounds and geometry.
 * @returns Updates the local preview when pointer capture and a transform are available.
 */
function previewRectangleRadius(
  event: PointerEvent<SVGCircleElement>,
  state: RectangleRadiusState,
) {
  if (state.draft === null || !event.currentTarget.hasPointerCapture(event.pointerId)) {
    return;
  }
  event.stopPropagation();
  const matrix = event.currentTarget.getScreenCTM();
  if (matrix) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    state.setDraft(Math.max(0, Math.min(state.maximum, Math.round(point.x - state.offset))));
  }
}

/**
 * Finishes a captured radius drag and commits only a changed value.
 *
 * @param event - Pointer release received by the radius control.
 * @param state - Current draft and persisted radius.
 * @returns Commits a changed radius or clears an unchanged draft.
 * @throws If the delegated property update fails.
 */
function finishRectangleRadius(event: PointerEvent<SVGCircleElement>, state: RectangleRadiusState) {
  event.stopPropagation();
  if (state.draft !== null && event.currentTarget.hasPointerCapture(event.pointerId)) {
    if (state.draft !== Math.min(state.saved, state.maximum)) {
      state.commit(state.draft);
    } else {
      state.setDraft(null);
    }
  }
}

/**
 * Adjusts the radius with a keyboard control or cancels its draft.
 *
 * @param event - Key event received by the radius control.
 * @param state - Current draft, visible limits and commit callback.
 * @returns Applies recognized keyboard actions and leaves other keys untouched.
 * @throws If the delegated property update fails.
 */
function adjustRectangleRadius(
  event: KeyboardEvent<SVGCircleElement>,
  state: RectangleRadiusState,
) {
  let next = Math.min(state.radius, state.maximum);
  switch (event.key) {
    case "Escape":
      state.setDraft(null);
      break;
    case "ArrowLeft":
    case "ArrowDown":
      next -= 1;
      break;
    case "ArrowRight":
    case "ArrowUp":
      next += 1;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = state.maximum;
      break;
    default:
      return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.key !== "Escape" && state.draft === null) {
    state.commit(next);
  }
}

/**
 * Renders the accessible radius control for the selected rectangle.
 *
 * @param state - Current radius geometry, draft and mutation callbacks.
 * @returns SVG slider retaining pointer capture and keyboard behavior.
 */
function renderRectangleRadiusHandle(state: RectangleRadiusState) {
  return (
    <circle
      {...elementControlProps<SVGCircleElement>((event) => {
        if (event.button !== 0) {
          return;
        }
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        state.setDraft(Math.min(state.saved, state.maximum));
      })}
      className="edgeless-rectangle-radius"
      role="slider"
      tabIndex={0}
      aria-label="Rectangle corner radius"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={state.maximum}
      aria-valuenow={Math.min(state.radius, state.maximum)}
      cx={Math.min(state.radius, state.maximum) + state.offset}
      cy={state.offset}
      r={5 / state.scale}
      vectorEffect="non-scaling-stroke"
      onPointerMove={(event) => previewRectangleRadius(event, state)}
      onPointerUp={(event) => finishRectangleRadius(event, state)}
      onPointerCancel={() => state.setDraft(null)}
      onLostPointerCapture={() => state.setDraft(null)}
      onBlur={() => state.setDraft(null)}
      onKeyDown={(event) => adjustRectangleRadius(event, state)}
    />
  );
}

/**
 * Owns the local radius draft and commits changes through the current element operations.
 *
 * @param props - Full element renderer contract and resolved stroke width.
 * @returns Radius geometry, draft and callbacks for the current renderer occurrence.
 */
function useRectangleRadius(
  props: ElementRenderProps & { strokeWidth: number },
): RectangleRadiusState {
  const { element, operations, zoom, strokeWidth } = props;
  const [draft, setDraft] = useState<number | null>(null);
  const saved = Number(element.props.cornerRadius ?? 3);
  const scale = Math.max(zoom, 0.01);
  const size = Math.min(element.frame.width, element.frame.height);
  const maximum = Math.max(0, (size - Math.min(size * 0.9, strokeWidth / scale)) / 2);
  const radius = draft ?? saved;
  const offset = 8 / scale;

  /**
   * Writes a changed radius through the owning panel's transactional property operation.
   *
   * @param value - Requested radius in canvas units, clamped to the visible limits.
   * @returns Clears the local draft and persists a changed radius as one undoable edit.
   * @throws If the element was deleted or property validation or storage fails.
   */
  const commit = (value: number) => {
    setDraft(null);
    const cornerRadius = Math.max(0, Math.min(maximum, value));
    if (cornerRadius !== saved) {
      operations.updateProperties(element.id, { cornerRadius });
    }
  };

  return { draft, saved, maximum, radius, offset, scale, setDraft, commit };
}

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
export function RectangleShape(
  props: ElementRenderProps & {
    fill: string;
    stroke: string;
    strokeWidth: number;
  },
) {
  const { selected, editing, preview, fill, stroke, strokeWidth } = props;
  const radiusState = useRectangleRadius(props);

  return (
    <>
      <rect
        width="100%"
        height="100%"
        rx={radiusState.radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      {selected && !editing && !preview && renderRectangleRadiusHandle(radiusState)}
    </>
  );
}
