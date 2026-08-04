import {
  useMemo,
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useEditorMode, useEditorRoot } from "../../../hooks";
import { useEdgelessSelection } from "../edgeless-runtime";
import { EdgelessToolButton, type EdgelessToolIcon } from "../edgeless-tool-button";
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

  /** Returns every rendered leaf and nested group marker moved by one group. */
  const groupPreviewElements = (id: string): HTMLElement[] => {
    if (!plane) return [];
    const keys = new Set<string>();
    const visit = (kind: "block" | "visual" | "group", itemId: string) => {
      const key = `${kind}:${itemId}`;
      if (keys.has(key)) return;
      keys.add(key);
      if (kind === "group") groups.find((group) => group.id === itemId)?.children.forEach((child) => visit(child.kind, child.id));
    };
    visit("group", id);
    return [...plane.querySelectorAll<HTMLElement>("[data-edgeless-object-kind][data-edgeless-object-id], [data-edgeless-group-bound-id]")]
      .filter((element) => {
        const kind = element.dataset.edgelessObjectKind ?? "group";
        const itemId = element.dataset.edgelessObjectId ?? element.dataset.edgelessGroupBoundId;
        return !!itemId && keys.has(`${kind}:${itemId}`);
      });
  };

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
  const centeredFrame = (): VisualFrame => {
    const rect = root.getBoundingClientRect();
    const center = canvasPoint({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
    return { x: center.x - 80, y: center.y - 60, width: 160, height: 120 };
  };
  const createCentered = (payload: { kind: "rectangle" | "ellipse" | "text" } | {
    kind: "sticker";
    source: { type: "image"; src: string } | { type: "emoji"; value: string };
    alt: string;
  }) => controller.create({ ...payload, frame: centeredFrame() });
  const oneSelectedVisual = selection.active && selection.items.length === 1 && selection.items[0]?.kind === "visual"
    ? selection.items[0].id
    : undefined;

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
            showProperties={options.toolbar !== false && oneSelectedVisual === visual.id}
            onText={(text) => controller.update({ id: visual.id, patch: { text } as never })}
            onUpdate={(patch) => controller.update({ id: visual.id, patch: patch as never })}
            onMove={(dx, dy) => controller.move(dx, dy)}
            onResize={(width, height) => controller.resize(width, height)}
          />
        ))}
        {groups.map((group) => {
          const bounds = controller.getBounds({ kind: "group", id: group.id });
          const selected = selection.active && selection.items.some((item) => item.kind === "group" && item.id === group.id);
          return bounds && (
            <Fragment key={group.id}>
              {selected && <div className="edgeless-group-bound" data-edgeless-group-bound-id={group.id} style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }} />}
              <button
                className="edgeless-group-label"
                data-edgeless-object-kind="group"
                data-edgeless-object-id={group.id}
                data-edgeless-group-drag-handle="true"
                style={{ left: bounds.x, top: bounds.y }}
                type="button"
                title={group.title}
                aria-label={`Move ${group.title}`}
                onDoubleClick={() => controller.reactEditor.editor.execute("edgeless.selection.set", group.children)}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  groupDrag.current = { id: group.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const start = groupDrag.current;
                  if (!start || start.id !== group.id || start.pointerId !== event.pointerId) return;
                  const transform = `translate(${(event.clientX - start.x) / zoom}px, ${(event.clientY - start.y) / zoom}px)`;
                  groupPreviewElements(group.id).forEach((element) => { element.style.transform = transform; });
                }}
                onPointerUp={(event) => {
                  const start = groupDrag.current;
                  if (!start || start.id !== group.id || start.pointerId !== event.pointerId) return;
                  groupDrag.current = null;
                  groupPreviewElements(group.id).forEach((element) => { element.style.removeProperty("transform"); });
                  const dx = (event.clientX - start.x) / zoom;
                  const dy = (event.clientY - start.y) / zoom;
                  if (dx || dy) controller.move(dx, dy);
                }}
                onPointerCancel={() => {
                  groupDrag.current = null;
                  groupPreviewElements(group.id).forEach((element) => { element.style.removeProperty("transform"); });
                }}
              >
                <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M5 4h2v2H5zm6 0h2v2h-2zM5 8h2v2H5zm6 0h2v2h-2zM5 12h2v2H5zm6 0h2v2h-2z" /></svg>
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
      {options.toolbar !== false && createPortal(<>
        <div className="edgeless-create-toolbar" data-edgeless-ui="true" role="toolbar" aria-label="Visual objects">
          <EdgelessToolButton label="Rectangle" icon="rectangle" onClick={() => createCentered({ kind: "rectangle" })} />
          <EdgelessToolButton label="Ellipse" icon="ellipse" onClick={() => createCentered({ kind: "ellipse" })} />
          <EdgelessToolButton label="Text" icon="text" onClick={() => createCentered({ kind: "text" })} />
          <EdgelessToolButton label="Draw" icon="draw" aria-pressed={controller.getTool() === "drawing"} onClick={() => controller.reactEditor.editor.execute("edgeless.tool.set", { tool: controller.getTool() === "drawing" ? "select" : "drawing" })} />
          {options.stickers?.map((sticker) => (
            <EdgelessToolButton key={sticker.id} label={sticker.label} onClick={() => createCentered({ kind: "sticker", source: sticker.source, alt: sticker.alt ?? sticker.label })}>
              {sticker.source.type === "emoji" ? sticker.source.value : <img src={sticker.source.src} alt="" />}
            </EdgelessToolButton>
          ))}
        </div>
        {selection.active && selection.items.length > 0 && (
          <SelectionToolbar controller={controller} items={selection.items} />
        )}
        </>,
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
  showProperties,
  onText,
  onUpdate,
  onMove,
  onResize,
}: {
  readonly visual: EdgelessVisual;
  readonly zoom: number;
  readonly selected: boolean;
  readonly showProperties: boolean;
  readonly onText: (text: string) => void;
  readonly onUpdate: (patch: Record<string, unknown>) => void;
  readonly onMove: (dx: number, dy: number) => void;
  readonly onResize: (width: number, height: number) => void;
}) {
  const [preview, setPreview] = useState<{ dx: number; dy: number; resize: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const text = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{ x: number; y: number; pointerId: number; resize: boolean } | null>(null);
  useEffect(() => {
    if (!editing) return;
    text.current?.focus({ preventScroll: true });
  }, [editing]);
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
    if (!resize && (editing || event.target instanceof Element && event.target.closest("[data-edgeless-ui], input, textarea, select, button"))) return;
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
        ref={text}
        className="edgeless-visual-text"
        contentEditable={editing}
        data-editing={editing || undefined}
        suppressContentEditableWarning
        style={{ color: visual.color, fontSize: visual.fontSize, textAlign: visual.align }}
        onBlur={(event) => {
          onText(event.currentTarget.textContent ?? "");
          setEditing(false);
        }}
      >{visual.text}</div>
    );
    return <svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="98" rx={visual.kind === "ellipse" ? 50 : 0} fill={visual.fill} stroke={visual.stroke} strokeWidth={visual.strokeWidth} vectorEffect="non-scaling-stroke" /></svg>;
  }, [editing, onText, visual]);
  return (
    <div
      className="edgeless-visual"
      data-edgeless-object-kind="visual"
      data-edgeless-object-id={visual.id}
      data-edgeless-visual-kind={visual.kind}
      data-selected={selected || undefined}
      data-editing={editing || undefined}
      style={style}
      onDoubleClick={(event) => {
        if (visual.kind !== "text") return;
        event.stopPropagation();
        setEditing(true);
      }}
      onPointerDown={(event) => pointerStart(event, false)}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
    >
      {content}
      {showProperties && visual.kind !== "sticker" && (
        <VisualProperties visual={visual} zoom={zoom} onUpdate={onUpdate} />
      )}
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

const alignments = [
  ["left", "Align left", "align-left"],
  ["center", "Align horizontal centers", "align-center"],
  ["right", "Align right", "align-right"],
  ["top", "Align top", "align-top"],
  ["middle", "Align vertical centers", "align-middle"],
  ["bottom", "Align bottom", "align-bottom"],
] as const satisfies readonly (readonly [string, string, EdgelessToolIcon])[];

/** Renders actions that operate on the current mixed canvas selection. */
function SelectionToolbar({
  controller,
  items,
}: {
  readonly controller: EdgelessVisualController;
  readonly items: readonly { kind: "block" | "visual" | "group"; id: string }[];
}) {
  const execute = (name: string, payload?: unknown) => controller.reactEditor.editor.execute(name, payload);
  return (
    <div className="edgeless-selection-toolbar" data-edgeless-ui="true" role="toolbar" aria-label="Selected objects">
      {items.length > 1 && <EdgelessToolButton label="Group" icon="group" onClick={() => execute("edgeless.selection.group")} />}
      {items.some((item) => item.kind === "group") && <EdgelessToolButton label="Ungroup" icon="ungroup" onClick={() => execute("edgeless.selection.ungroup")} />}
      {items.length > 1 && alignments.map(([alignment, label, icon]) => (
        <EdgelessToolButton key={alignment} label={label} icon={icon} onClick={() => execute("edgeless.selection.align", alignment)} />
      ))}
      {items.length > 2 && <>
        <EdgelessToolButton label="Distribute horizontally" icon="distribute-h" onClick={() => execute("edgeless.selection.distribute", "horizontal")} />
        <EdgelessToolButton label="Distribute vertically" icon="distribute-v" onClick={() => execute("edgeless.selection.distribute", "vertical")} />
      </>}
      {(["front", "forward", "backward", "back"] as const).map((direction) => (
        <EdgelessToolButton key={direction} label={`Move ${direction}`} icon={direction} onClick={() => execute("edgeless.selection.reorder", direction)} />
      ))}
    </div>
  );
}

/** Renders immediately applied controls for one selected visual record. */
function VisualProperties({
  visual,
  zoom,
  onUpdate,
}: {
  readonly visual: Exclude<EdgelessVisual, { kind: "sticker" }>;
  readonly zoom: number;
  readonly onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const color = (label: string, value: string, name: "fill" | "stroke" | "color") => (
    <ColorControl label={label} value={value} onCommit={(next) => onUpdate({ [name]: next })} />
  );
  const width = "strokeWidth" in visual && (
    <label>
      <span>Stroke</span>
      <input type="number" aria-label="Stroke width" min={1} max={24} value={visual.strokeWidth} onChange={(event) => onUpdate({ strokeWidth: Number(event.currentTarget.value) })} />
    </label>
  );
  return (
    <div
      className="edgeless-visual-properties"
      data-edgeless-ui="true"
      role="toolbar"
      aria-label="Visual properties"
      style={{ "--edgeless-properties-scale": 1 / zoom } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {(visual.kind === "rectangle" || visual.kind === "ellipse") && <>
        {color("Fill color", visual.fill, "fill")}
        {color("Stroke color", visual.stroke, "stroke")}
        {width}
      </>}
      {visual.kind === "drawing" && <>
        {color("Stroke color", visual.stroke, "stroke")}
        {width}
      </>}
      {visual.kind === "text" && <>
        {color("Text color", visual.color, "color")}
        <label>
          <span>Size</span>
          <input type="number" aria-label="Font size" min={8} max={160} value={visual.fontSize} onChange={(event) => onUpdate({ fontSize: Number(event.currentTarget.value) })} />
        </label>
        {(["left", "center", "right"] as const).map((alignment) => (
          <EdgelessToolButton key={alignment} label={`Text align ${alignment}`} icon={`align-${alignment}` as EdgelessToolIcon} aria-pressed={visual.align === alignment} onClick={() => onUpdate({ align: alignment })} />
        ))}
      </>}
    </div>
  );
}

/** Keeps rapid native picker previews local and persists only the committed color. */
function ColorControl({
  label,
  value,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const commit = useRef(onCommit);
  const [draft, setDraft] = useState(value);
  commit.current = onCommit;
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const handleChange = () => commit.current(element.value);
    element.addEventListener("change", handleChange);
    return () => element.removeEventListener("change", handleChange);
  }, []);
  return (
    <label title={label}>
      <span>{label}</span>
      <input ref={input} type="color" aria-label={label} value={draft} onInput={(event) => setDraft(event.currentTarget.value)} />
    </label>
  );
}
