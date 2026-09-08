import type { PointerEvent as ReactPointerEvent } from "react";
import type { ConnectorLineStyle, EdgelessVisualTool, VisualFrame } from "../types";
import type { ConnectorHover, ConnectorPreview } from "../hooks/use-drawing-gesture";
import { connectorPath } from "../utils/geometry";
import { shapeStrokePad } from "../utils/shape-stroke";
import type { CanvasPoint } from "../utils/canvas-point";

/** Visual defaults used to paint a near-real place preview. */
export interface PlacePreviewStyle {
  readonly shape: {
    readonly fill: string;
    readonly stroke: string;
    readonly strokeWidth: number;
    readonly filled: boolean;
    readonly stroked: boolean;
  };
  readonly text: {
    readonly color: string;
    readonly fontFamily: string;
    readonly fontSize: number;
  };
  readonly sticker: {
    readonly fill: string;
    readonly color: string;
    readonly fontFamily: string;
    readonly fontSize: number;
  };
}

/** Full-plane SVG that captures drawing/eraser/connector/place gestures. */
export function DrawingCapture({
  tool,
  zoom,
  preview,
  placePreview,
  placeStyle,
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
}: {
  tool: EdgelessVisualTool;
  zoom: number;
  preview: readonly CanvasPoint[];
  placePreview: VisualFrame | null;
  placeStyle: PlacePreviewStyle;
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
      {placePreview && tool.tool === "place" && (
        <PlacePreview frame={placePreview} kind={tool.kind} style={placeStyle} zoom={zoom} fill={tool.kind === "sticker" ? tool.fill : undefined} />
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

/** Dashed frame outline so place size is obvious next to the shape ghost. */
function PlaceBBox({ frame }: { frame: VisualFrame }) {
  return (
    <rect
      className="edgeless-place-preview-bbox"
      x={frame.x}
      y={frame.y}
      width={frame.width}
      height={frame.height}
      fill="none"
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** Near-real object ghost for place tools (fill/stroke from creation defaults). */
function PlacePreview({
  frame,
  kind,
  style,
  zoom,
  fill,
}: {
  frame: VisualFrame;
  kind: "rectangle" | "ellipse" | "text" | "sticker";
  style: PlacePreviewStyle;
  zoom: number;
  fill?: string;
}) {
  if (kind === "text") {
    const pad = 8 / zoom;
    return (
      <g className="edgeless-place-preview-group" data-edgeless-place-kind="text">
        <PlaceBBox frame={frame} />
        <g opacity={0.7}>
          <rect
            x={frame.x}
            y={frame.y}
            width={frame.width}
            height={frame.height}
            rx={2 / zoom}
            fill="#ffffff"
            stroke={style.text.color}
            strokeWidth={1.25 / zoom}
          />
          <text
            x={frame.x + pad}
            y={frame.y + pad + style.text.fontSize * 0.85}
            fill={style.text.color}
            fontFamily={style.text.fontFamily}
            fontSize={style.text.fontSize}
          >
            Text
          </text>
        </g>
      </g>
    );
  }

  if (kind === "sticker") {
    const stickerFill = fill ?? style.sticker.fill;
    const pad = 10 / zoom;
    return (
      <g className="edgeless-place-preview-group" data-edgeless-place-kind="sticker">
        <PlaceBBox frame={frame} />
        <g opacity={0.72}>
          <rect
            x={frame.x}
            y={frame.y}
            width={frame.width}
            height={frame.height}
            rx={6 / zoom}
            fill={stickerFill}
            stroke="rgb(0 0 0 / 12%)"
            strokeWidth={1 / zoom}
          />
          <text
            x={frame.x + pad}
            y={frame.y + pad + style.sticker.fontSize * 0.85}
            fill={style.sticker.color}
            fontFamily={style.sticker.fontFamily}
            fontSize={style.sticker.fontSize}
          >
            Note
          </text>
        </g>
      </g>
    );
  }

  const { shape } = style;
  const filled = shape.filled !== false;
  const stroked = shape.stroked !== false;
  const pad = shapeStrokePad(stroked ? shape.strokeWidth : 0, frame, zoom);
  const insetX = (pad.x / 100) * frame.width;
  const insetY = (pad.y / 100) * frame.height;
  const fillPaint = filled ? shape.fill : "none";
  const strokePaint = stroked ? shape.stroke : "none";
  const strokeWidth = stroked ? shape.strokeWidth : 0;

  return (
    <g className="edgeless-place-preview-group" data-edgeless-place-kind={kind}>
      <PlaceBBox frame={frame} />
      <g opacity={0.7}>
        {kind === "ellipse" ? (
          <ellipse
            cx={frame.x + frame.width / 2}
            cy={frame.y + frame.height / 2}
            rx={Math.max(1, frame.width / 2 - insetX)}
            ry={Math.max(1, frame.height / 2 - insetY)}
            fill={fillPaint}
            stroke={strokePaint}
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <rect
            x={frame.x + insetX}
            y={frame.y + insetY}
            width={Math.max(1, frame.width - insetX * 2)}
            height={Math.max(1, frame.height - insetY * 2)}
            rx={3 / zoom}
            fill={fillPaint}
            stroke={strokePaint}
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    </g>
  );
}
