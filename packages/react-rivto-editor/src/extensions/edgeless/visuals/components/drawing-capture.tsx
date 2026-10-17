import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useEditorRoot } from "../../../../hooks/editor/use-editor-root";
import type { ConnectorLineStyle, EdgelessVisualTool } from "../../../../elements/visuals/types";
import type { ConnectorHover, ConnectorPreview } from "../hooks/use-drawing-gesture";
import { connectorPath } from "../../../../elements/visuals/utils/geometry";
import type { CanvasPoint } from "../../../../elements/visuals/utils/canvas-point";

/**
 * Full-plane SVG that captures drawing/eraser/connector/place gestures.
 *
 * Connector preview arrowheads extend their triangle tips one stroke width beyond the draft path endpoints.
 *
 * Observes the editor root's pan and zoom attributes, keeping counter-transform
 * variables on this SVG so viewport gestures do not invalidate card styles.
 * The observer disconnects when the root changes or this layer unmounts.
 *
 * @param props - Current tool, drawing and connector drafts, attachment markers and gesture pointer handlers.
 * @param props.tool - Active canvas tool; select and pan do not capture drawing gestures.
 * @param props.zoom - Viewport scale used to keep preview strokes at screen size.
 * @param props.preview - Drawing draft points in canvas coordinates.
 * @param props.connectorPreview - Connector draft geometry, or null without a draft.
 * @param props.connectorHover - Attachment feedback, or null without a hovered target.
 * @param props.drawingStroke - Drawing draft stroke color.
 * @param props.drawingStrokeWidth - Drawing draft stroke width in screen pixels.
 * @param props.drawingOpacity - Drawing draft opacity.
 * @param props.connectorStroke - Connector draft stroke color.
 * @param props.connectorStrokeWidth - Connector draft stroke width in screen pixels.
 * @param props.connectorLineStyle - Connector draft line pattern; defaults to solid.
 * @param props.connectorStartStyle - Start marker; defaults to none.
 * @param props.connectorEndStyle - End marker; defaults to an arrow.
 * @param props.onPointerDown - Starts a gesture with the SVG pointer event.
 * @param props.onPointerMove - Updates a gesture with the SVG pointer event.
 * @param props.onPointerUp - Completes or cancels a gesture with the SVG pointer event.
 * @param props.onPointerLeave - Clears attachment feedback when the pointer leaves.
 * @returns Plane-sized SVG capture layer with local drawing/connector feedback; placement content uses ElementCreationPreview.
 * @throws If rendered outside an EditorPanel or EditorEmbed subtree.
 */
export function DrawingCapture({
  tool,
  zoom,
  preview,
  connectorPreview,
  connectorHover,
  drawingStroke,
  drawingStrokeWidth,
  drawingOpacity,
  connectorStroke,
  connectorStrokeWidth,
  connectorLineStyle = "solid",
  connectorStartStyle = "none",
  connectorEndStyle = "arrow",
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}: {
  tool: EdgelessVisualTool;
  zoom: number;
  preview: readonly CanvasPoint[];
  connectorPreview: ConnectorPreview | null;
  connectorHover: ConnectorHover | null;
  drawingStroke: string;
  drawingStrokeWidth: number;
  drawingOpacity: number;
  connectorStroke: string;
  connectorStrokeWidth: number;
  connectorLineStyle?: ConnectorLineStyle;
  connectorStartStyle?: "none" | "arrow";
  connectorEndStyle?: "none" | "arrow";
  /**
   * Starts the drawing or connector gesture at the pointer position.
   *
   * @param event - Native or React event supplying the current input.
   */
  onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void;
  /**
   * Updates the drawing or connector gesture preview at the pointer position.
   *
   * @param event - Native or React event supplying the current input.
   */
  onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void;
  /**
   * Completes the drawing or connector gesture at the pointer position.
   *
   * @param event - Native or React event supplying the current input.
   */
  onPointerUp(event: ReactPointerEvent<SVGSVGElement>): void;
  /**
   * Clears the drawing capture's pointer hover state.
   */
  onPointerLeave(): void;
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
  const captureActive = tool.tool !== "select" && tool.tool !== "pan";
  return (
    <svg
      ref={capture}
      className="edgeless-drawing-capture"
      data-active={captureActive || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
        {preview.length > 1 && tool.tool === "drawing" && (
          <path
            d={preview.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ")}
            fill="none"
            stroke={drawingStroke}
            strokeWidth={drawingStrokeWidth / zoom}
            strokeLinecap="butt"
            strokeLinejoin="round"
            opacity={drawingOpacity}
          />
        )}
        {connectorPreview && (
          <>
            <defs>
              <marker
                id="edgeless-connector-preview-end"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0 0L8 4L0 8z" fill={connectorStroke} />
              </marker>
              <marker
                id="edgeless-connector-preview-start"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto-start-reverse"
              >
                <path d="M0 0L8 4L0 8z" fill={connectorStroke} />
              </marker>
            </defs>
            <path
              data-edgeless-connector-preview-stroke="true"
              data-line-style={connectorLineStyle}
              d={connectorPath(
                connectorPreview.source,
                connectorPreview.target,
                connectorPreview.route,
                connectorPreview.sourceAnchor,
                connectorPreview.targetAnchor,
                connectorPreview.sourceFrame,
                connectorPreview.targetFrame,
              )}
              fill="none"
              stroke={connectorStroke}
              strokeWidth={connectorStrokeWidth / zoom}
              markerStart={
                connectorStartStyle === "arrow"
                  ? "url(#edgeless-connector-preview-start)"
                  : undefined
              }
              markerEnd={
                connectorEndStyle === "arrow" ? "url(#edgeless-connector-preview-end)" : undefined
              }
            />
          </>
        )}
        {connectorHover && (
          <g
            className="edgeless-connector-anchors"
            data-edgeless-connector-anchors={connectorHover.elementId}
          >
            <rect
              className="edgeless-connector-target-outline"
              x={connectorHover.outline.x}
              y={connectorHover.outline.y}
              width={connectorHover.outline.width}
              height={connectorHover.outline.height}
              rx={4 / zoom}
            />
            {connectorHover.anchors.map((anchor, index) => (
              <circle
                key={index}
                className="edgeless-connector-anchor"
                data-active={anchor.active || undefined}
                cx={anchor.x}
                cy={anchor.y}
                r={anchor.active ? 5 / zoom : 3.5 / zoom}
              />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}
