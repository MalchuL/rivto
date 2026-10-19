import type { ConnectorLineStyle } from "../../../../elements/visuals/types";
import type { ConnectorHover, ConnectorPreview } from "./connector-targets";
import { connectorPath } from "../../../../elements/visuals/utils/geometry";
import { DrawingCapture } from "../components/drawing-capture";

/**
 * Renders connector drafts and attachment feedback without capturing pointer input.
 *
 * Connector preview arrowheads extend their triangle tips one stroke width beyond the draft path endpoints.
 *
 * Observes the editor root's pan and zoom attributes, keeping counter-transform
 * variables on this SVG so viewport gestures do not invalidate card styles.
 * The observer disconnects when the root changes or this layer unmounts.
 *
 * @param props - Connector draft, attachment markers and screen-constant stroke settings.
 * @param props.zoom - Viewport scale used to keep preview strokes at screen size.
 * @param props.connectorPreview - Connector draft geometry, or null without a draft.
 * @param props.connectorHover - Attachment feedback, or null without a hovered target.
 * @param props.connectorStroke - Connector draft stroke color.
 * @param props.connectorStrokeWidth - Connector draft stroke width in screen pixels.
 * @param props.connectorLineStyle - Connector draft line pattern; defaults to solid.
 * @param props.connectorStartStyle - Start marker; defaults to none.
 * @param props.connectorEndStyle - End marker; defaults to an arrow.
 * @returns Plane-sized, non-interactive SVG feedback aligned with the current canvas.
 * @throws If rendered outside an EditorPanel or EditorEmbed subtree.
 */
export function ConnectorGesturePreview({
  zoom,
  connectorPreview = null,
  connectorHover = null,
  connectorStroke = "",
  connectorStrokeWidth = 1,
  connectorLineStyle = "solid",
  connectorStartStyle = "none",
  connectorEndStyle = "arrow",
}: {
  readonly zoom: number;
  readonly connectorPreview?: ConnectorPreview | null;
  readonly connectorHover?: ConnectorHover | null;
  readonly connectorStroke?: string;
  readonly connectorStrokeWidth?: number;
  readonly connectorLineStyle?: ConnectorLineStyle;
  readonly connectorStartStyle?: "none" | "arrow";
  readonly connectorEndStyle?: "none" | "arrow";
}) {
  return (
    <DrawingCapture>
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
              connectorStartStyle === "arrow" ? "url(#edgeless-connector-preview-start)" : undefined
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
    </DrawingCapture>
  );
}
