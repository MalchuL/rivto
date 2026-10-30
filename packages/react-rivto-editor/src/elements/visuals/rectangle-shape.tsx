import { useState } from "react";
import type { ElementRenderProps } from "../../managers/elements/types";
import { editorControlProps } from "../../constants";

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
  const { element, operations, zoom, selected, editing, preview, fill, stroke, strokeWidth } =
    props;
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
        <circle
          {...editorControlProps}
          data-edgeless-ui="true"
          className="edgeless-rectangle-radius"
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
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0) {
              return;
            }
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraft(Math.min(saved, maximum));
          }}
          onPointerMove={(event) => {
            if (draft === null || !event.currentTarget.hasPointerCapture(event.pointerId)) {
              return;
            }
            event.stopPropagation();
            const matrix = event.currentTarget.getScreenCTM();
            if (matrix) {
              const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
                matrix.inverse(),
              );
              setDraft(Math.max(0, Math.min(maximum, Math.round(point.x - offset))));
            }
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            if (draft !== null && event.currentTarget.hasPointerCapture(event.pointerId)) {
              if (draft !== Math.min(saved, maximum)) {
                commit(draft);
              } else {
                setDraft(null);
              }
            }
          }}
          onPointerCancel={() => setDraft(null)}
          onLostPointerCapture={() => setDraft(null)}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            let next = Math.min(radius, maximum);
            switch (event.key) {
              case "Escape":
                setDraft(null);
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
                next = maximum;
                break;
              default:
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (event.key !== "Escape" && draft === null) {
              commit(next);
            }
          }}
        />
      )}
    </>
  );
}
