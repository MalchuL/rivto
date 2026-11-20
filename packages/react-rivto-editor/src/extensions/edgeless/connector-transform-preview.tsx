import { useSyncExternalStore } from "react";
import { CanvasWorldPortal } from "@chulane/rivto-edgeless/react";
import type { ConnectorTransformItemProps, ConnectorTransformPreviewProps } from "./types";

/**
 * Renders this panel's connector transform previews in the canvas world layer.
 *
 * The controller publishes detached geometry; the portal owns mounted SVG and
 * label elements and removes them when the gesture ends or the view detaches.
 *
 * @param props - Controller supplying the current preview snapshot.
 * @param props.controller - Borrowed preview subscription and snapshot reads.
 * @returns Preview paths and labels, or null when no connector needs an overlay.
 */
export function ConnectorTransformPreview({ controller }: ConnectorTransformPreviewProps) {
  const previews = useSyncExternalStore(
    controller.subscribeConnectorPreview,
    controller.getConnectorPreview,
    controller.getConnectorPreview,
  );
  if (!previews.length) {
    return null;
  }
  return (
    <CanvasWorldPortal>
      <svg data-edgeless-connector-preview="true" className="edgeless-connector-live-preview">
        <defs>
          {previews.map((preview) => (
            <ConnectorMarkers key={preview.id} preview={preview} />
          ))}
        </defs>
        {previews.map((preview) => (
          <ConnectorPath key={preview.id} preview={preview} />
        ))}
      </svg>
      {previews.map((preview) => (
        <ConnectorLabel key={preview.id} preview={preview} />
      ))}
    </CanvasWorldPortal>
  );
}

/**
 * Renders the reusable arrow definitions required by one preview path.
 *
 * The triangle tip extends one stroke width beyond the path endpoint for both orientations.
 *
 * @param props - One connector's detached preview data.
 * @param props.preview - Arrow choices, stroke color and stable connector identity.
 * @returns Arrow markers for enabled ends, or an empty fragment.
 */
function ConnectorMarkers({ preview }: ConnectorTransformItemProps) {
  return (
    <>
      {preview.startArrow && (
        <marker
          id={`connector-preview-start-${preview.id}`}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto-start-reverse"
        >
          <path d="M0 0L8 4L0 8z" fill={preview.stroke} />
        </marker>
      )}
      {preview.endArrow && (
        <marker
          id={`connector-preview-end-${preview.id}`}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0 0L8 4L0 8z" fill={preview.stroke} />
        </marker>
      )}
    </>
  );
}

/**
 * Renders one connector's current transform-preview path.
 *
 * @param props - One connector's detached preview data.
 * @param props.preview - Path geometry, stroke, and enabled arrow ends.
 * @returns The non-scaling SVG stroke for the current gesture.
 */
function ConnectorPath({ preview }: ConnectorTransformItemProps) {
  return (
    <path
      data-edgeless-connector-preview-stroke="true"
      data-line-style={preview.lineStyle}
      fill="none"
      stroke={preview.stroke}
      strokeWidth={preview.strokeWidth}
      opacity={preview.opacity}
      vectorEffect="non-scaling-stroke"
      markerStart={preview.startArrow ? `url(#connector-preview-start-${preview.id})` : undefined}
      markerEnd={preview.endArrow ? `url(#connector-preview-end-${preview.id})` : undefined}
      d={preview.path}
    />
  );
}

/**
 * Renders a connector label at its current preview position and rotation.
 *
 * @param props - One connector's detached preview data.
 * @param props.preview - Label content and world geometry, if the connector has text.
 * @returns Positioned label, or null for a connector without text.
 */
function ConnectorLabel({ preview }: ConnectorTransformItemProps) {
  const label = preview.label;
  if (!label) {
    return null;
  }
  return (
    <div
      className="edgeless-connector-label edgeless-connector-label-preview"
      data-edgeless-connector-preview-label={preview.id}
      data-text-rotation={label.textRotation}
      style={{
        left: label.x,
        top: label.y,
        transform: label.degrees ? `rotate(${label.degrees}deg)` : undefined,
        color: label.color,
        fontFamily: label.fontFamily,
        fontSize: label.fontSize,
        textAlign: label.align,
        zIndex: 2147483639,
      }}
    >
      {label.text}
    </div>
  );
}
