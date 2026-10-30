import { useLayoutEffect, useRef, type ReactNode, type PointerEventHandler } from "react";
import { useEditorRoot } from "../../../../hooks/editor/use-editor-root";

/**
 * Covers the canvas viewport with an SVG event layer without knowing the active tool type.
 *
 * Observes pan and zoom attributes and counter-transforms the capture box without
 * invalidating card styles. Children use absolute canvas coordinates. Cleanup
 * disconnects the observer when the root changes or the layer unmounts.
 *
 * @param props - Capture capability, optional pointer adapters and arbitrary SVG preview content.
 * @param props.active - Whether the layer accepts pointer input; defaults to false.
 * @param props.children - Optional SVG feedback in absolute canvas coordinates.
 * @param props.onPointerDown - Offers a primary gesture to the tool adapter.
 * @param props.onPointerMove - Routes hover and captured motion to the adapter.
 * @param props.onPointerUp - Completes the accepted gesture through the adapter.
 * @param props.onPointerCancel - Discards the accepted gesture on browser cancellation.
 * @param props.onPointerLeave - Removes hover feedback when leaving the viewport.
 * @returns Viewport-sized capture layer with a restored canvas origin.
 * @throws If rendered outside an EditorPanel or EditorEmbed subtree.
 */
export function DrawingCapture({
  active = false,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
}: {
  readonly active?: boolean;
  readonly children?: ReactNode;
  readonly onPointerDown?: PointerEventHandler<SVGSVGElement>;
  readonly onPointerMove?: PointerEventHandler<SVGSVGElement>;
  readonly onPointerUp?: PointerEventHandler<SVGSVGElement>;
  readonly onPointerCancel?: PointerEventHandler<SVGSVGElement>;
  readonly onPointerLeave?: PointerEventHandler<SVGSVGElement>;
}) {
  const { element: root } = useEditorRoot();
  const capture = useRef<SVGSVGElement | null>(null);
  useLayoutEffect(() => {
    const svg = capture.current;
    if (!root || !svg) {
      return;
    }
    /**
     * Keeps capture geometry local so viewport changes do not restyle every card.
     *
     * Move and size the capture box against the plane transform so it
     * continues covering the viewport after any pan or zoom. The offset
     * variables below restore absolute canvas coordinates inside that box.
     *
     * @returns Updates only the SVG's viewport coverage and preview origin.
     */
    const refresh = (): void => {
      const scale = Number(root.dataset.edgelessZoom) || 1;
      const x = Number(root.dataset.edgelessPanX) || 0;
      const y = Number(root.dataset.edgelessPanY) || 0;
      svg.style.setProperty("--edgeless-capture-left", `${-x / scale}px`);
      svg.style.setProperty("--edgeless-capture-top", `${-y / scale}px`);
      svg.style.setProperty("--edgeless-capture-width", `${100 / scale}%`);
      svg.style.setProperty("--edgeless-capture-height", `${100 / scale}%`);
      svg.style.setProperty("--edgeless-capture-offset-x", `${x / scale}px`);
      svg.style.setProperty("--edgeless-capture-offset-y", `${y / scale}px`);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-edgeless-zoom", "data-edgeless-pan-x", "data-edgeless-pan-y"],
    });
    return () => observer.disconnect();
  }, [root]);
  return (
    <svg
      ref={capture}
      className="edgeless-drawing-capture"
      data-active={active || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
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
