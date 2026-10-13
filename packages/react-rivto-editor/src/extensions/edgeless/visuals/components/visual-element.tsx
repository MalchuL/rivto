/**
 * One first-class edgeless visual (shape, text, sticker, drawing, connector).
 *
 * Selection handles subscribe per visual ID so marquee growth over a neighbor
 * does not re-render this node or recreate its label editor.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ElementSlots } from "../../../../blocks";
import { type EditableLabelFocusPoint } from "../../../../components";
import { editorControlProps } from "../../../../constants";
import { useEdgelessSelected } from "../../../built-ins/selection/edgeless-runtime";
import type { EdgelessOperations } from "../../edgeless-operations";
import type { ConnectorEndpoint, EdgelessVisual } from "../types";
import { useEdgelessElementStyle } from "../../use-edgeless-element-style";
import { VisualContentContext } from "./builtin-visual-content";

const LABEL_KINDS = new Set(["text", "sticker", "rectangle", "ellipse", "connector"]);

/**
 * Renders one persisted visual without owning canvas movement.
 *
 * Selection chrome is subscribed per visual ID so a sibling entering the
 * marquee does not re-render this node.
 *
 * @param props - Visual snapshot, edgeless operations, and connector gesture callbacks.
 * @param props.visual - Persisted visual to render.
 * @param props.edgelessOperation - Owning edgeless operations.
 * @param props.zoom - Current canvas zoom factor.
 * @param props.resolveEndpoint - Maps a pointer to a connector endpoint.
 * @param props.onReconnectHover - Hover preview while dragging an endpoint.
 * @param props.onReconnect - Commits a connector endpoint reconnect.
 * @returns Positioned visual host with optional resize/rotate chrome.
 */
export function VisualElement({
  visual,
  edgelessOperation,
  zoom,
  resolveEndpoint,
  onReconnectHover,
  onReconnect,
}: {
  readonly visual: EdgelessVisual;
  readonly edgelessOperation: EdgelessOperations;
  readonly zoom: number;
  readonly resolveEndpoint: (event: Pick<PointerEvent, "clientX" | "clientY">) => ConnectorEndpoint;
  readonly onReconnectHover: (event: Pick<PointerEvent, "clientX" | "clientY"> | null) => void;
  readonly onReconnect: (key: "source" | "target", endpoint: ConnectorEndpoint) => void;
}) {
  const selected = useEdgelessSelected(visual.id);
  const element = edgelessOperation.elements.getElementNode(visual.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ key: "source" | "target"; endpoint: ConnectorEndpoint } | null>(null);
  const focusPointRef = useRef<EditableLabelFocusPoint | null>(null);
  useEffect(() => () => onReconnectHover(null), [onReconnectHover]);

  const source = visual.kind === "connector" && draft?.key === "source" ? draft.endpoint : visual.kind === "connector" ? visual.source : undefined;
  const target = visual.kind === "connector" && draft?.key === "target" ? draft.endpoint : visual.kind === "connector" ? visual.target : undefined;

  // Echo transform preview inline styles while locked so React does not clear them.
  const { ref: hostRef, style } = useEdgelessElementStyle<HTMLDivElement>(element);
  const canEditLabel = LABEL_KINDS.has(visual.kind);
  const Renderer = element && edgelessOperation.runtime.elementTypes.get(element.type)?.render;
  const reactPanel = edgelessOperation.reactPanel;
  const content = element && reactPanel && Renderer
    ? <VisualContentContext.Provider value={{ visual, edgelessOperation, zoom, editing, setEditing, focusPointRef, source, target }}>
        <Renderer element={element} reactPanel={reactPanel} />
      </VisualContentContext.Provider>
    : <div role="status">Unknown element: {element?.type}</div>;

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
      {element && <ElementSlots element={element} selected={selected} />}
      {selected && visual.kind === "connector" && source && target && (["source", "target"] as const).map((key) => {
        const point = (key === "source" ? source : target).position;
        return (
          <button {...editorControlProps}
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
