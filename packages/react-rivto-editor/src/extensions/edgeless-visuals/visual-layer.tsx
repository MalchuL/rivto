import {
  useMemo,
  Fragment,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useEditorMode, useEditorRoot } from "../../hooks";
import { useEdgelessSelection } from "../edgeless-runtime";
import type { EdgelessVisualController } from "./controller";
import type { EdgelessVisual, EdgelessVisualsOptions, VisualFrame } from "./types";

interface DrawGesture {
  pointerId: number;
  points: Array<{ x: number; y: number }>;
}

/**
 * Renders extension-owned visual leaves, tools, and lightweight group controls.
 *
 * @param props - Controller and host toolbar configuration.
 * @returns Portals targeting the active edgeless plane and viewport, or null in block mode.
 */
export function EdgelessVisualLayer({
  controller,
  options,
}: {
  readonly controller: EdgelessVisualController;
  readonly options: EdgelessVisualsOptions;
}) {
  const { mode } = useEditorMode();
  const { element: root } = useEditorRoot();
  const selection = useEdgelessSelection();
  const draw = useRef<DrawGesture | null>(null);
  const groupDrag = useRef<{ id: string; x: number; y: number; pointerId: number } | null>(null);
  const [preview, setPreview] = useState<Array<{ x: number; y: number }>>([]);
  useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getTool(),
    () => controller.getTool(),
  );
  const plane = root?.querySelector<HTMLElement>("[data-edgeless-plane]") ?? null;
  const zoom = Number(root?.dataset.edgelessZoom) || 1;
  const visuals = controller.getVisuals();
  const groups = controller.getGroups();

  /** Converts a viewport pointer into unscaled canvas coordinates. */
  const canvasPoint = (event: Pick<PointerEvent, "clientX" | "clientY">) => {
    const rect = plane?.getBoundingClientRect();
    const zoom = Number(root?.dataset.edgelessZoom) || 1;
    return rect ? { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom } : { x: 0, y: 0 };
  };
  /** Starts one pointer-captured freehand gesture when the draw tool is active. */
  const startDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (controller.getTool() !== "drawing" || event.button !== 0) return;
    const point = canvasPoint(event.nativeEvent);
    draw.current = { pointerId: event.pointerId, points: [point] };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreview([point]);
    event.preventDefault();
  };
  /** Appends one canvas point to the active freehand preview. */
  const moveDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = draw.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.points.push(canvasPoint(event.nativeEvent));
    setPreview([...gesture.points]);
  };
  /** Persists the completed stroke with frame-relative points. */
  const finishDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = draw.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    draw.current = null;
    setPreview([]);
    if (gesture.points.length < 2) return;
    const xs = gesture.points.map((point) => point.x);
    const ys = gesture.points.map((point) => point.y);
    const frame: VisualFrame = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
    };
    controller.create({
      kind: "drawing",
      frame,
      points: gesture.points.map((point) => ({ x: point.x - frame.x, y: point.y - frame.y })),
    });
    controller.reactEditor.editor.execute("edgeless.tool.set", { tool: "select" });
  };

  if (mode !== "edgeless" || !root || !plane) return null;
  const path = (points: Array<{ x: number; y: number }>) => points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
  const panX = Number(root.dataset.edgelessPanX) || 0;
  const panY = Number(root.dataset.edgelessPanY) || 0;

  return <>
    {createPortal(
    <>
      <div className="edgeless-visual-layer">
        {visuals.map((visual) => (
          <VisualElement
            key={visual.id}
            visual={visual}
            zoom={zoom}
            selected={selection.active && selection.items.some((item) => item.kind === "visual" && item.id === visual.id)}
            onText={(text) => controller.update({ id: visual.id, patch: { text } as never })}
            onMove={(dx, dy) => controller.move(dx, dy)}
            onResize={(width, height) => controller.resize(width, height)}
          />
        ))}
        {groups.map((group) => {
          const bounds = controller.getBounds({ kind: "group", id: group.id });
          const selected = selection.active && selection.items.some((item) => item.kind === "group" && item.id === group.id);
          return bounds && (
            <Fragment key={group.id}>
              {selected && <div className="edgeless-group-bound" style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }} />}
              <button
                className="edgeless-group-label"
                data-edgeless-object-kind="group"
                data-edgeless-object-id={group.id}
                style={{ left: bounds.x, top: bounds.y }}
                type="button"
                title={group.title}
                onDoubleClick={() => controller.reactEditor.editor.execute("edgeless.selection.set", group.children)}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  groupDrag.current = { id: group.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const start = groupDrag.current;
                  if (!start || start.id !== group.id || start.pointerId !== event.pointerId) return;
                  event.currentTarget.style.transform = `translate(${(event.clientX - start.x) / zoom}px, ${(event.clientY - start.y) / zoom}px)`;
                }}
                onPointerUp={(event) => {
                  const start = groupDrag.current;
                  if (!start || start.id !== group.id || start.pointerId !== event.pointerId) return;
                  groupDrag.current = null;
                  event.currentTarget.style.removeProperty("transform");
                  controller.move((event.clientX - start.x) / zoom, (event.clientY - start.y) / zoom);
                }}
              >
                {group.title}
              </button>
            </Fragment>
          );
        })}
      </div>
    </>,
    plane,
    )}
    {createPortal(
      <svg
        className="edgeless-drawing-capture"
        data-active={controller.getTool() === "drawing" || undefined}
        onPointerDown={startDrawing}
        onPointerMove={moveDrawing}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
      >
        {preview.length > 1 && (
          <g transform={`translate(${panX} ${panY}) scale(${zoom})`}>
            <path d={path(preview)} fill="none" stroke="#222" strokeWidth={3 / zoom} />
          </g>
        )}
      </svg>,
      root,
    )}
      {options.toolbar !== false && createPortal(
        <div className="edgeless-visual-toolbar" role="toolbar" aria-label="Visual objects">
          <button type="button" onClick={() => controller.create({ kind: "rectangle" })}>Rectangle</button>
          <button type="button" onClick={() => controller.create({ kind: "ellipse" })}>Ellipse</button>
          <button type="button" onClick={() => controller.create({ kind: "text" })}>Text</button>
          <button type="button" aria-pressed={controller.getTool() === "drawing"} onClick={() => controller.reactEditor.editor.execute("edgeless.tool.set", { tool: controller.getTool() === "drawing" ? "select" : "drawing" })}>Draw</button>
          {options.stickers?.map((sticker) => (
            <button key={sticker.id} type="button" title={sticker.label} onClick={() => controller.create({ kind: "sticker", source: sticker.source, alt: sticker.alt ?? sticker.label })}>{sticker.source.type === "emoji" ? sticker.source.value : sticker.label}</button>
          ))}
          {selection.active && selection.items.length > 1 && <>
            <button type="button" onClick={() => controller.reactEditor.editor.execute("edgeless.selection.group")}>Group</button>
            {(["left", "center", "right", "top", "middle", "bottom"] as const).map((alignment) => <button key={alignment} type="button" onClick={() => controller.reactEditor.editor.execute("edgeless.selection.align", alignment)}>{alignment}</button>)}
            <button type="button" onClick={() => controller.reactEditor.editor.execute("edgeless.selection.distribute", "horizontal")}>Distribute H</button>
            <button type="button" onClick={() => controller.reactEditor.editor.execute("edgeless.selection.distribute", "vertical")}>Distribute V</button>
          </>}
          {selection.active && selection.items.some((item) => item.kind === "group") && <button type="button" onClick={() => controller.reactEditor.editor.execute("edgeless.selection.ungroup")}>Ungroup</button>}
          {selection.active && selection.items.length > 0 && (["front", "forward", "backward", "back"] as const).map((direction) => <button key={direction} type="button" onClick={() => controller.reactEditor.editor.execute("edgeless.selection.reorder", direction)}>{direction}</button>)}
        </div>,
        root,
      )}
  </>;
}

/**
 * Renders one persisted visual leaf with stable edgeless object markers.
 *
 * @param props - Visual record, selection state, and mutation callbacks.
 * @returns Positioned interactive DOM for the visual leaf.
 */
function VisualElement({
  visual,
  zoom,
  selected,
  onText,
  onMove,
  onResize,
}: {
  readonly visual: EdgelessVisual;
  readonly zoom: number;
  readonly selected: boolean;
  readonly onText: (text: string) => void;
  readonly onMove: (dx: number, dy: number) => void;
  readonly onResize: (width: number, height: number) => void;
}) {
  const [preview, setPreview] = useState<{ dx: number; dy: number; resize: boolean } | null>(null);
  const gesture = useRef<{ x: number; y: number; pointerId: number; resize: boolean } | null>(null);
  const style: CSSProperties = {
    left: visual.frame.x,
    top: visual.frame.y,
    width: visual.frame.width,
    height: visual.frame.height,
    zIndex: visual.zIndex,
    transform: preview && !preview.resize ? `translate(${preview.dx}px, ${preview.dy}px)` : undefined,
    ...(preview?.resize ? { width: Math.max(1, visual.frame.width + preview.dx), height: Math.max(1, visual.frame.height + preview.dy) } : {}),
  };
  const pointerStart = (event: ReactPointerEvent<HTMLDivElement>, resize: boolean) => {
    if (event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, resize };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setPreview({ dx: (event.clientX - start.x) / zoom, dy: (event.clientY - start.y) / zoom, resize: start.resize });
  };
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = (event.clientX - start.x) / zoom;
    const dy = (event.clientY - start.y) / zoom;
    gesture.current = null;
    setPreview(null);
    if (start.resize) onResize(Math.max(1, visual.frame.width + dx), Math.max(1, visual.frame.height + dy));
    else if (dx || dy) onMove(dx, dy);
  };
  const content = useMemo(() => {
    if (visual.kind === "sticker") return visual.source.type === "image"
      ? <img src={visual.source.src} alt={visual.alt} draggable={false} />
      : <span role="img" aria-label={visual.alt}>{visual.source.value}</span>;
    if (visual.kind === "drawing") return (
      <svg viewBox={`0 0 ${visual.frame.width} ${visual.frame.height}`} preserveAspectRatio="none">
        <path d={visual.points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ")} fill="none" stroke={visual.stroke} strokeWidth={visual.strokeWidth} vectorEffect="non-scaling-stroke" />
      </svg>
    );
    if (visual.kind === "text") return (
      <div
        className="edgeless-visual-text"
        contentEditable
        suppressContentEditableWarning
        style={{ color: visual.color, fontSize: visual.fontSize, textAlign: visual.align }}
        onBlur={(event) => onText(event.currentTarget.textContent ?? "")}
      >{visual.text}</div>
    );
    return <svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="98" rx={visual.kind === "ellipse" ? 50 : 0} fill={visual.fill} stroke={visual.stroke} strokeWidth={visual.strokeWidth} vectorEffect="non-scaling-stroke" /></svg>;
  }, [onText, visual]);
  return (
    <div
      className="edgeless-visual"
      data-edgeless-object-kind="visual"
      data-edgeless-object-id={visual.id}
      data-edgeless-visual-kind={visual.kind}
      data-selected={selected || undefined}
      style={style}
      onPointerDown={(event) => pointerStart(event, false)}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
    >
      {content}
      {selected && <button
        className="edgeless-visual-resize"
        data-edgeless-resize-handle="true"
        type="button"
        aria-label="Resize visual object"
        onPointerDown={(event) => pointerStart(event as unknown as ReactPointerEvent<HTMLDivElement>, true)}
      />}
    </div>
  );
}
