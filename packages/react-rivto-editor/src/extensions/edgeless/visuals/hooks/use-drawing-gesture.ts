import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EdgelessVisualController } from "../controller";
import type { ConnectorEndpoint, ConnectorRoute, CreateVisualPayload, EdgelessVisualTool, VisualFrame } from "../types";
import { canvasPoint, type CanvasPoint } from "../utils/canvas-point";
import { padDrawingFrame } from "../utils/drawing-frame";
import { edgeAnchors, inflateFrame, nearestAnchor, pointInFrame, segmentIntersectsFrame } from "../utils/geometry";

/** Outside attach halo in canvas units (screen-constant via zoom). */
const ATTACH_PAD_PX = 22;
const DEFAULT_PLACE = { width: 160, height: 120 } as const;
const MIN_PLACE = 16;

interface Gesture {
  pointerId: number;
  points: CanvasPoint[];
  source?: ConnectorEndpoint;
  target?: ConnectorEndpoint;
  erased: Set<string>;
}

export interface ConnectorAnchorMarker {
  x: number;
  y: number;
  active: boolean;
}

export interface ConnectorHover {
  elementId: string;
  frame: VisualFrame;
  outline: VisualFrame;
  anchors: readonly ConnectorAnchorMarker[];
}

export interface ConnectorPreview {
  source: CanvasPoint;
  target: CanvasPoint;
  route: ConnectorRoute;
  sourceAnchor?: { x: number; y: number };
  targetAnchor?: { x: number; y: number };
  sourceFrame?: VisualFrame;
  targetFrame?: VisualFrame;
}

function frameFromDrag(start: CanvasPoint, end: CanvasPoint): VisualFrame {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.max(MIN_PLACE, Math.abs(end.x - start.x)),
    height: Math.max(MIN_PLACE, Math.abs(end.y - start.y)),
  };
}

function defaultPlaceFrame(point: CanvasPoint): VisualFrame {
  return {
    x: point.x - DEFAULT_PLACE.width / 2,
    y: point.y - DEFAULT_PLACE.height / 2,
    width: DEFAULT_PLACE.width,
    height: DEFAULT_PLACE.height,
  };
}

function placePayload(tool: Extract<EdgelessVisualTool, { tool: "place" }>, frame: VisualFrame): CreateVisualPayload {
  if (tool.kind === "sticker") {
    return { kind: "sticker", frame, fill: tool.fill, color: tool.color, fontFamily: tool.fontFamily };
  }
  if (tool.kind === "text") return { kind: "text", frame };
  return { kind: tool.kind, frame };
}

/** Drawing, eraser, connector, and place pointer capture against the plane SVG. */
export function useDrawingGesture({
  controller,
  root,
  plane,
  zoom,
  tool,
}: {
  controller: EdgelessVisualController;
  root: HTMLElement | null;
  plane: HTMLElement | null;
  zoom: number;
  tool: EdgelessVisualTool;
}) {
  const gesture = useRef<Gesture | null>(null);
  const captureEl = useRef<SVGSVGElement | null>(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [preview, setPreview] = useState<CanvasPoint[]>([]);
  const [placePreview, setPlacePreview] = useState<VisualFrame | null>(null);
  const [connectorPreview, setConnectorPreview] = useState<ConnectorPreview | null>(null);
  const [connectorHover, setConnectorHover] = useState<ConnectorHover | null>(null);
  const attachPad = ATTACH_PAD_PX / Math.max(zoom, 0.01);

  const objectAt = (point: CanvasPoint): string | undefined => {
    const candidates = controller.reactEditor.editor.elements.getElements()
      .filter((element) => element.type !== "connector" && element.type !== "group"
        && pointInFrame(point, inflateFrame(element.frame, attachPad)))
      .sort((a, b) => b.zIndex - a.zIndex);
    let id = candidates[0]?.id;
    while (id) {
      const parent = controller.getParentId(id);
      if (!parent) break;
      id = parent;
    }
    return id;
  };

  const endpoint = (id: string, point: CanvasPoint): ConnectorEndpoint => {
    const frame = controller.getBounds(id)!;
    const anchor = nearestAnchor(frame, point);
    return { elementId: id, anchor, position: { x: frame.x + frame.width * anchor.x, y: frame.y + frame.height * anchor.y } };
  };

  const hoverFor = (point: CanvasPoint, excludeId?: string): ConnectorHover | null => {
    const id = objectAt(point);
    if (!id || id === excludeId) return null;
    const frame = controller.getBounds(id);
    if (!frame) return null;
    const nearest = nearestAnchor(frame, point);
    return {
      elementId: id,
      frame,
      outline: inflateFrame(frame, attachPad),
      anchors: edgeAnchors(frame).map((anchor) => ({
        x: anchor.x,
        y: anchor.y,
        active: anchor.ax === nearest.x && anchor.ay === nearest.y,
      })),
    };
  };

  const clearErased = () => root?.querySelectorAll<HTMLElement>("[data-edgeless-erase-target]").forEach((element) => {
    delete element.dataset.edgelessEraseTarget;
  });

  const cancelGesture = () => {
    const active = gesture.current;
    if (!active) return false;
    const last = active.points.at(-1);
    const pointerId = active.pointerId;
    gesture.current = null;
    setPreview([]);
    setConnectorPreview(null);
    clearErased();
    const host = captureEl.current;
    if (host?.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId);
    if (toolRef.current.tool === "place" && last) setPlacePreview(defaultPlaceFrame(last));
    else setPlacePreview(null);
    return true;
  };

  useEffect(() => {
    if (tool.tool === "connector") return;
    setConnectorHover(null);
  }, [tool]);

  useEffect(() => {
    if (tool.tool === "place") return;
    setPlacePreview(null);
  }, [tool]);

  useEffect(() => {
    const dispose = controller.reactEditor.keyboard.register({
      id: "edgeless.gesture-cancel",
      keys: ["Escape"],
      mode: "edgeless",
      priority: 40,
      when: () => Boolean(gesture.current),
    }, () => cancelGesture());
    return dispose;
  }, [controller]);

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool.tool === "select" || tool.tool === "pan" || event.button !== 0) return;
    const point = canvasPoint(event.nativeEvent, plane, zoom);
    const start: Gesture = { pointerId: event.pointerId, points: [point], erased: new Set() };
    if (tool.tool === "connector") {
      const id = objectAt(point);
      if (!id) return;
      start.source = endpoint(id, point);
      setConnectorHover(hoverFor(point));
    }
    gesture.current = start;
    captureEl.current = event.currentTarget;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool.tool === "place") setPlacePreview(defaultPlaceFrame(point));
    else setPreview([point]);
    event.preventDefault();
  };

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = canvasPoint(event.nativeEvent, plane, zoom);
    if (tool.tool === "connector") {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) {
        setConnectorHover(hoverFor(point));
        return;
      }
      active.points.push(point);
      const targetId = objectAt(point);
      active.target = targetId && targetId !== active.source?.elementId ? endpoint(targetId, point) : undefined;
      setConnectorPreview({
        source: active.source!.position,
        target: active.target?.position ?? point,
        route: tool.route,
        sourceAnchor: active.source!.anchor,
        targetAnchor: active.target?.anchor,
        sourceFrame: active.source?.elementId ? controller.getBounds(active.source.elementId) : undefined,
        targetFrame: active.target?.elementId ? controller.getBounds(active.target.elementId) : undefined,
      });
      setConnectorHover(hoverFor(point, active.source?.elementId));
      return;
    }

    if (tool.tool === "place") {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) {
        setPlacePreview(defaultPlaceFrame(point));
        return;
      }
      const start = active.points[0]!;
      active.points.push(point);
      const moved = Math.hypot(point.x - start.x, point.y - start.y) >= 4;
      setPlacePreview(moved ? frameFromDrag(start, point) : defaultPlaceFrame(start));
      return;
    }

    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const previous = active.points.at(-1)!;
    active.points.push(point);
    if (tool.tool === "eraser") {
      const elements = controller.reactEditor.editor.elements.getElements().filter((element) => element.type !== "group");
      elements.forEach((element) => {
        if (!segmentIntersectsFrame(previous, point, element.frame)) return;
        let id = element.id;
        while (controller.getParentId(id)) id = controller.getParentId(id)!;
        active.erased.add(id);
      });
      root?.querySelectorAll<HTMLElement>("[data-edgeless-object-id]").forEach((element) => {
        if (active.erased.has(element.dataset.edgelessObjectId ?? "")) element.dataset.edgelessEraseTarget = "true";
      });
    } else setPreview([...active.points]);
  };

  const pointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    setPreview([]);
    setPlacePreview(null);
    setConnectorPreview(null);
    clearErased();
    if (tool.tool === "eraser") controller.deleteItems([...active.erased]);
    else if (tool.tool === "connector" && active.source && active.target) {
      controller.create({ kind: "connector", source: active.source, target: active.target, route: tool.route });
    } else if (tool.tool === "drawing" && active.points.length > 1) {
      const strokeWidth = controller.getDefaults().drawing.strokeWidth;
      const padded = padDrawingFrame(active.points, strokeWidth, zoom);
      controller.create({
        kind: "drawing",
        brush: tool.brush,
        frame: padded.frame,
        points: padded.points,
      });
    } else if (tool.tool === "place") {
      const start = active.points[0]!;
      const end = active.points.at(-1) ?? start;
      const moved = Math.hypot(end.x - start.x, end.y - start.y) >= 4;
      const frame = moved ? frameFromDrag(start, end) : defaultPlaceFrame(start);
      controller.create(placePayload(tool, frame));
      setPlacePreview(defaultPlaceFrame(end));
    }
    if (tool.tool === "connector") {
      const point = canvasPoint(event.nativeEvent, plane, zoom);
      setConnectorHover(hoverFor(point));
    }
  };

  return {
    preview,
    placePreview,
    connectorPreview,
    connectorHover,
    objectAt,
    endpoint,
    hoverFor,
    cancelGesture,
    pointerDown,
    pointerMove,
    pointerEnd,
  };
}
