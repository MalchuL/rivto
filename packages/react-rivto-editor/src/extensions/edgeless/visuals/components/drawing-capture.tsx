import type { PointerEvent as ReactPointerEvent } from "react";
import type { ConnectorLineStyle, EdgelessVisualTool } from "../../../../elements/visuals/types";
import type { ConnectorHover, ConnectorPreview } from "../hooks/use-drawing-gesture";
import { connectorPath } from "../../../../elements/visuals/utils/geometry";
import type { CanvasPoint } from "../../../../elements/visuals/utils/canvas-point";

/** Full-plane SVG that captures drawing/eraser/connector/place gestures. */
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
  onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void;
  onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void;
  onPointerUp(event: ReactPointerEvent<SVGSVGElement>): void;
  onPointerLeave(): void;
}) {
  const captureActive = tool.tool !== "select" && tool.tool !== "pan";
  return (
    <svg
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
      <g style={{
        transform: "translate(var(--edgeless-capture-offset-x, 0px), var(--edgeless-capture-offset-y, 0px))",
      }}>
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
            <marker id="edgeless-connector-preview-end" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0 0L8 4L0 8z" fill={connectorStroke} />
            </marker>
            <marker id="edgeless-connector-preview-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
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
            markerStart={connectorStartStyle === "arrow" ? "url(#edgeless-connector-preview-start)" : undefined}
            markerEnd={connectorEndStyle === "arrow" ? "url(#edgeless-connector-preview-end)" : undefined}
          />
        </>
      )}
      {connectorHover && (
        <g className="edgeless-connector-anchors" data-edgeless-connector-anchors={connectorHover.elementId}>
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
