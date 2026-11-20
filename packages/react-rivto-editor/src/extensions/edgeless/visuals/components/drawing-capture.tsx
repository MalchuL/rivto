import { useLayoutEffect, useRef } from "react";
import type { CanvasApi } from "@chulane/rivto-edgeless";
import { useEdgelessCanvas } from "../../../../surfaces/edgeless/edgeless-tools-context";
import type { DrawingCaptureProps } from "./types";

/**
 * Covers the canvas viewport with an SVG event layer without knowing the active tool type.
 *
 * Observes the canvas camera and counter-transforms the capture box without
 * invalidating card styles. Children use absolute canvas coordinates. Cleanup
 * releases the camera subscription when the canvas changes or the layer unmounts.
 * Outside an edgeless surface the layer keeps its default camera geometry.
 *
 * @param props - Capture capability and arbitrary SVG preview content.
 * @param props.active - Whether the layer accepts pointer input; defaults to false.
 * @param props.children - Optional SVG feedback in absolute canvas coordinates.
 * The active marker lets the viewport's normalized input registrations route
 * pointer starts, movement, release, cancellation and exit to the tool gesture.
 * @returns Viewport-sized capture layer with a restored canvas origin.
 */
export function DrawingCapture({ active = false, children }: DrawingCaptureProps) {
  const canvas = useEdgelessCanvas();
  const capture = useRef<SVGSVGElement | null>(null);
  useLayoutEffect(() => {
    const svg = capture.current;
    if (!canvas || !svg) {
      return;
    }
    return subscribeCaptureCamera(canvas.camera, svg);
  }, [canvas]);
  return (
    <svg
      ref={capture}
      className="edgeless-drawing-capture"
      data-active={active || undefined}
      data-edgeless-tool-capture={active || undefined}
    >
      {/* The capture box follows the viewport, while previews use absolute
          canvas coordinates. Restore the panned plane origin for their paths. */}
      <g
        style={{
          transform:
            "translate(var(--edgeless-capture-offset-x, 0px), var(--edgeless-capture-offset-y, 0px))",
        }}
      >
        {children}
      </g>
    </svg>
  );
}

/**
 * Keeps capture geometry local so camera changes do not restyle every card.
 *
 * The box counteracts the world-plane transform and continues covering the
 * viewport after pan or zoom. Offset variables restore absolute canvas
 * coordinates for previews inside the box.
 *
 * @param camera - Borrowed camera snapshot and change subscription.
 * @param svg - Mounted capture layer to update.
 * @returns Disposer that stops updating the SVG when the layer unmounts.
 */
function subscribeCaptureCamera(camera: CanvasApi["camera"], svg: SVGSVGElement): () => void {
  /**
   * Applies the current camera to the SVG's coverage and preview origin.
   *
   * @returns The capture geometry reflects the latest camera snapshot.
   */
  const refresh = (): void => {
    const { x, y, zoom: scale } = camera.get();
    svg.style.setProperty("--edgeless-capture-left", `${-x / scale}px`);
    svg.style.setProperty("--edgeless-capture-top", `${-y / scale}px`);
    svg.style.setProperty("--edgeless-capture-width", `${100 / scale}%`);
    svg.style.setProperty("--edgeless-capture-height", `${100 / scale}%`);
    svg.style.setProperty("--edgeless-capture-offset-x", `${x / scale}px`);
    svg.style.setProperty("--edgeless-capture-offset-y", `${y / scale}px`);
  };
  refresh();
  return camera.subscribe(refresh);
}
