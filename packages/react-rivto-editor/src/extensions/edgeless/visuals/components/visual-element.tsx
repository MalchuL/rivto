import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  EditableLabel,
  type EditableLabelFocusPoint,
} from "../../../../components";
import { EdgelessDragHandle } from "../../edgeless-drag-handle";
import type { EdgelessVisualController } from "../controller";
import type { ConnectorEndpoint, EdgelessVisual } from "../types";
import { connectorLabelPoint, connectorPoints } from "../utils/geometry";
import { shapeStrokePad } from "../utils/shape-stroke";

const LABEL_KINDS = new Set(["text", "sticker", "rectangle", "ellipse", "connector"]);

/** Renders one persisted visual without owning canvas movement. */
export function VisualElement({
  visual,
  controller,
  selected,
  zoom,
  resolveEndpoint,
  onReconnectHover,
  onReconnect,
}: {
  readonly visual: EdgelessVisual;
  readonly controller: EdgelessVisualController;
  readonly selected: boolean;
  readonly zoom: number;
  readonly resolveEndpoint: (event: Pick<PointerEvent, "clientX" | "clientY">) => ConnectorEndpoint;
  readonly onReconnectHover: (event: Pick<PointerEvent, "clientX" | "clientY"> | null) => void;
  readonly onReconnect: (key: "source" | "target", endpoint: ConnectorEndpoint) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ key: "source" | "target"; endpoint: ConnectorEndpoint } | null>(null);
  const focusPointRef = useRef<EditableLabelFocusPoint | null>(null);
  useEffect(() => () => onReconnectHover(null), [onReconnectHover]);

  const source = visual.kind === "connector" && draft?.key === "source" ? draft.endpoint : visual.kind === "connector" ? visual.source : undefined;
  const target = visual.kind === "connector" && draft?.key === "target" ? draft.endpoint : visual.kind === "connector" ? visual.target : undefined;

  const hostRef = useRef<HTMLDivElement | null>(null);
  // Echo transform preview inline styles while locked so React does not clear them.
  const host = hostRef.current;
  const geometryLocked = host?.dataset.edgelessGeometryLock === "true";
  const style: CSSProperties = {
    left: geometryLocked && host.style.left ? host.style.left : visual.frame.x,
    top: geometryLocked && host.style.top ? host.style.top : visual.frame.y,
    width: geometryLocked && host.style.width ? host.style.width : visual.frame.width,
    height: geometryLocked && host.style.height ? host.style.height : visual.frame.height,
    zIndex: visual.zIndex,
  };
  const canEditLabel = LABEL_KINDS.has(visual.kind);
  const content = useMemo(() => {
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
              style={{
                left: labelAt.x,
                top: labelAt.y,
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
  }, [controller, editing, source, target, visual, zoom]);

  const moveEndpoint = (key: "source" | "target", event: Pick<PointerEvent, "clientX" | "clientY">) => {
    const endpoint = resolveEndpoint(event);
    setDraft({ key, endpoint });
    onReconnectHover(event);
  };

  const endEndpoint = (key: "source" | "target", event: ReactPointerEvent<HTMLButtonElement>) => {
    const endpoint = resolveEndpoint(event.nativeEvent);
    setDraft(null);
    onReconnectHover(null);
    onReconnect(key, endpoint);
  };

  return (
    <div
      ref={hostRef}
      className="edgeless-visual"
      data-edgeless-object-kind="visual"
      data-edgeless-object-id={visual.id}
      data-edgeless-visual-kind={visual.kind}
      data-edgeless-connector-route={visual.kind === "connector" ? visual.route : undefined}
      data-selected={selected || undefined}
      data-editing={editing || undefined}
      data-reconnect-preview={draft ? draft.key : undefined}
      style={style}
      onDoubleClick={(event) => {
        if (!canEditLabel) return;
        event.stopPropagation();
        focusPointRef.current = { x: event.clientX, y: event.clientY };
        setEditing(true);
      }}
    >
      {content}
      {selected && visual.kind !== "connector" && (
        <EdgelessDragHandle label={`Drag ${visual.kind}`} />
      )}
      {selected && visual.kind !== "connector" && (["nw", "ne", "sw", "se"] as const).map((corner) => (
        <button
          key={corner}
          className="edgeless-visual-resize"
          data-edgeless-resize-handle={corner}
          type="button"
          aria-label={`Resize ${corner}`}
        />
      ))}
      {selected && visual.kind === "connector" && source && target && (["source", "target"] as const).map((key) => {
        const point = (key === "source" ? source : target).position;
        return (
          <button
            key={key}
            className="edgeless-connector-endpoint"
            data-edgeless-connector-endpoint={key}
            type="button"
            aria-label={`Reconnect ${key}`}
            style={{ left: point.x - visual.frame.x, top: point.y - visual.frame.y }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              event.stopPropagation();
              moveEndpoint(key, event.nativeEvent);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              event.stopPropagation();
              moveEndpoint(key, event.nativeEvent);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              endEndpoint(key, event);
            }}
            onPointerCancel={() => {
              setDraft(null);
              onReconnectHover(null);
            }}
          />
        );
      })}
    </div>
  );
}
