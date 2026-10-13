import { createContext, useContext, type RefObject } from 'react';
import { EditableLabel, type EditableLabelFocusPoint } from '../../../../components';
import type { EdgelessOperations } from '../../edgeless-operations';
import type { ConnectorEndpoint, EdgelessVisual } from '../types';
import { connectorLabelCssDegrees, connectorLabelPoint, connectorPoints } from '../utils/geometry';
import { shapeStrokePad } from '../utils/shape-stroke';

/** Per-element label and connector interaction supplied by the common positioned host. */
interface VisualContentState {
  visual: EdgelessVisual;
  controller: EdgelessOperations;
  zoom: number;
  editing: boolean;
  setEditing(value: boolean): void;
  focusPointRef: RefObject<EditableLabelFocusPoint | null>;
  source?: ConnectorEndpoint;
  target?: ConnectorEndpoint;
}
export const VisualContentContext = createContext<VisualContentState | null>(null);

/** Built-in figure content; placement, selection and geometry remain owned by the common element host. */
export function BuiltinVisualContent() {
  const context = useContext(VisualContentContext);
  if (!context) throw new Error('Built-in visual content requires an element host');
  const { visual, controller, zoom, editing, setEditing, focusPointRef, source, target } = context;

    const labelFor = (text: string) => (
      <EditableLabel
        className="edgeless-label-editor"
        editing={editing}
        onEditingChange={setEditing}
        text={text}
        onCommit={(next) => controller.update({ id: visual.id, patch: { text: next } as never })}
        focusPointRef={focusPointRef}
        stopPointerWhileEditing
      />
    );
    if (visual.kind === "drawing") {
      const d = visual.points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
      return (
        <svg className="edgeless-drawing" viewBox={`0 0 ${visual.frame.width} ${visual.frame.height}`} preserveAspectRatio="none">
          {/* Wide invisible stroke: select only near the ink, not the frame AABB. */}
          <path className="edgeless-drawing-hit" d={d} />
          <path
            className="edgeless-drawing-stroke"
            d={d}
            fill="none"
            stroke={visual.stroke}
            strokeWidth={visual.strokeWidth}
            opacity={visual.opacity}
            strokeLinecap="butt"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    }
    if (visual.kind === "connector" && source && target) {
      const sourceBound = source.elementId ? controller.getBounds(source.elementId) : undefined;
      const targetBound = target.elementId ? controller.getBounds(target.elementId) : undefined;
      const points = connectorPoints(
        source.position,
        target.position,
        visual.route,
        source.anchor,
        target.anchor,
        sourceBound,
        targetBound,
      ).map((point) => ({ x: point.x - visual.frame.x, y: point.y - visual.frame.y }));
      const path = visual.route === "curve"
        ? `M ${points[0]!.x} ${points[0]!.y} C ${points[1]!.x} ${points[1]!.y}, ${points[2]!.x} ${points[2]!.y}, ${points[3]!.x} ${points[3]!.y}`
        : points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
      const markerEnd = `connector-arrow-end-${visual.id}`;
      const markerStart = `connector-arrow-start-${visual.id}`;
      const labelAt = connectorLabelPoint(points, visual.route);
      const labelDegrees = connectorLabelCssDegrees(points, visual.route, visual.textRotation);
      return (
        <>
          <svg className="edgeless-connector" viewBox={`0 0 ${visual.frame.width} ${visual.frame.height}`} preserveAspectRatio="none">
            <defs>
              <marker id={markerEnd} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0 0L8 4L0 8z" fill={visual.stroke} />
              </marker>
              <marker id={markerStart} markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
                <path d="M0 0L8 4L0 8z" fill={visual.stroke} />
              </marker>
            </defs>
            <path className="edgeless-connector-hit" d={path} />
            <path
              className="edgeless-connector-stroke"
              data-line-style={visual.lineStyle}
              d={path}
              fill="none"
              stroke={visual.stroke}
              strokeWidth={visual.strokeWidth}
              opacity={visual.opacity}
              markerStart={visual.startStyle === "arrow" ? `url(#${markerStart})` : undefined}
              markerEnd={visual.endStyle === "arrow" ? `url(#${markerEnd})` : undefined}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {(editing || visual.text) && (
            <div
              className="edgeless-connector-label"
              data-editing={editing || undefined}
              data-empty={!visual.text && !editing ? "true" : undefined}
              data-vertical-align={visual.verticalAlign}
              data-text-rotation={visual.textRotation}
              style={{
                left: labelAt.x,
                top: labelAt.y,
                color: visual.color,
                fontFamily: visual.fontFamily,
                fontSize: visual.fontSize,
                textAlign: visual.align,
                transform: labelDegrees ? `rotate(${labelDegrees}deg)` : undefined,
              }}
            >
              {labelFor(visual.text)}
            </div>
          )}
        </>
      );
    }
    if (visual.kind === "text" || visual.kind === "sticker") {
      return (
        <div
          className={visual.kind === "sticker" ? "edgeless-sticker-text" : "edgeless-visual-text"}
          data-editing={editing || undefined}
          data-vertical-align={visual.verticalAlign}
          style={{
            color: visual.color,
            background: visual.kind === "sticker" ? visual.fill : undefined,
            fontFamily: visual.fontFamily,
            fontSize: visual.fontSize,
            textAlign: visual.align,
          }}
        >
          {labelFor(visual.text)}
        </div>
      );
    }
    if (visual.kind !== "rectangle" && visual.kind !== "ellipse") return null;
    const stroked = visual.stroked !== false;
    const filled = visual.filled !== false;
    const pad = shapeStrokePad(stroked ? visual.strokeWidth : 0, visual.frame, zoom);
    const fill = filled ? visual.fill : "none";
    const stroke = stroked ? visual.stroke : "none";
    const strokeWidth = stroked ? visual.strokeWidth : 0;
    const shape = visual.kind === "ellipse" ? (
      <ellipse
        cx="50"
        cy="50"
        rx={Math.max(1, 50 - pad.x)}
        ry={Math.max(1, 50 - pad.y)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    ) : (
      <rect
        x={pad.x}
        y={pad.y}
        width={Math.max(1, 100 - pad.x * 2)}
        height={Math.max(1, 100 - pad.y * 2)}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    );
    return (
      <>
        <svg className="edgeless-shape" viewBox="0 0 100 100" preserveAspectRatio="none">
          {shape}
        </svg>
        {(editing || visual.text) && (
          <div
            className="edgeless-shape-label"
            data-editing={editing || undefined}
            data-empty={!visual.text && !editing ? "true" : undefined}
            data-vertical-align={visual.verticalAlign}
            style={{
              color: visual.color,
              fontFamily: visual.fontFamily,
              fontSize: visual.fontSize,
              textAlign: visual.align,
            }}
          >
            {labelFor(visual.text)}
          </div>
        )}
      </>
    );

}
