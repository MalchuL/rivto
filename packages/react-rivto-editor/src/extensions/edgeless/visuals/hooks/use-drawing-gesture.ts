import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EdgelessVisualController } from "../controller";
import type { ConnectorEndpoint, ConnectorRoute, CreateVisualPayload, EdgelessVisualTool, VisualFrame } from "../types";
import { canvasPoint, type CanvasPoint } from "../utils/canvas-point";
import {
  centeredPlaceFrame,
  snapDraggedFrame,
  snapPlacedFrame,
  type CreationSnapOptions,
} from "../utils/creation-geometry";
import { padDrawingFrame } from "../utils/drawing-frame";
import { edgeAnchors, endpointPoint, inflateFrame, nearestAnchor, pointInRotatedFrame, segmentIntersectsRotatedFrame } from "../utils/geometry";
import { showSnapGuides } from "../utils/snap-guides";

/** Outside attach halo in canvas units (screen-constant via zoom). */
const ATTACH_PAD_PX = 22;
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
  zoom,
  tool,
}: {
  controller: EdgelessVisualController;
  root: HTMLElement | null;
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

  const creationCandidates = (): VisualFrame[] => controller.reactEditor.editor.elements.getElements()
    .filter((element) => element.type !== "connector" && element.type !== "group")
    .map((element) => element.frame);

  const snapOptions = (altKey = false): CreationSnapOptions => ({
    snapToGrid: root?.dataset.edgelessSnap !== "false",
    alignObjects: root?.dataset.edgelessAlign !== "false",
    grid: Number(root?.dataset.edgelessGrid) || undefined,
    threshold: 8 / Math.max(zoom, 0.01),
    disabled: altKey,
  });

  const placedFrame = (point: CanvasPoint, altKey = false) => snapPlacedFrame(
    centeredPlaceFrame(point, controller.getPlaceSize()),
    creationCandidates(),
    snapOptions(altKey),
  );

  const objectAt = (point: CanvasPoint): string | undefined => {
    const candidates = controller.reactEditor.editor.elements.getElements()
      .filter((element) => element.type !== "connector" && element.type !== "group"
        && pointInRotatedFrame(point, inflateFrame(element.frame, attachPad), controller.getRotation(element.id)))
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
    const frame = controller.getFrame(id)!;
    const rotation = controller.getRotation(id);
    const anchor = nearestAnchor(frame, point, rotation);
    return { elementId: id, anchor, position: endpointPoint({ anchor, position: point }, frame, rotation) };
  };

  const hoverFor = (point: CanvasPoint, excludeId?: string): ConnectorHover | null => {
    const id = objectAt(point);
    if (!id || id === excludeId) return null;
    const frame = controller.getFrame(id);
    if (!frame) return null;
    const rotation = controller.getRotation(id);
    const nearest = nearestAnchor(frame, point, rotation);
    return {
      elementId: id,
      frame,
      outline: inflateFrame(controller.getBounds(id) ?? frame, attachPad),
      anchors: edgeAnchors(frame, rotation).map((anchor) => ({
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
    if (root) showSnapGuides(root, []);
    if (toolRef.current.tool === "place" && last) setPlacePreview(placedFrame(last).frame);
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
    if (root) showSnapGuides(root, []);
  }, [root, tool]);

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
    const point = canvasPoint(event.nativeEvent, root, zoom);
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
    if (tool.tool === "place") {
      const snapped = placedFrame(point, event.altKey);
      setPlacePreview(snapped.frame);
      if (root) showSnapGuides(root, snapped.guides);
    }
    else setPreview([point]);
    event.preventDefault();
  };

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = canvasPoint(event.nativeEvent, root, zoom);
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
        const snapped = placedFrame(point, event.altKey);
        setPlacePreview(snapped.frame);
        if (root) showSnapGuides(root, snapped.guides);
        return;
      }
      const start = active.points[0]!;
      active.points.push(point);
      const moved = Math.hypot(point.x - start.x, point.y - start.y) >= 4;
      const snapped = moved
        ? snapDraggedFrame(start, point, creationCandidates(), snapOptions(event.altKey), event.shiftKey)
        : placedFrame(start, event.altKey);
      setPlacePreview(snapped.frame);
      if (root) showSnapGuides(root, snapped.guides);
      return;
    }

    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const previous = active.points.at(-1)!;
    active.points.push(point);
    if (tool.tool === "eraser") {
      const elements = controller.reactEditor.editor.elements.getElements().filter((element) => element.type !== "group");
      elements.forEach((element) => {
        if (!segmentIntersectsRotatedFrame(previous, point, element.frame, controller.getRotation(element.id))) return;
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
    if (event.type === "pointercancel") {
      cancelGesture();
      return;
    }
    gesture.current = null;
    setPreview([]);
    setPlacePreview(null);
    setConnectorPreview(null);
    clearErased();
    if (root) showSnapGuides(root, []);
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
      const frame = moved
        ? snapDraggedFrame(start, end, creationCandidates(), snapOptions(event.altKey), event.shiftKey).frame
        : placedFrame(start, event.altKey).frame;
      controller.create(placePayload(tool, frame));
      if (moved) controller.rememberPlaceSize(frame);
      setPlacePreview(placedFrame(end, event.altKey).frame);
    }
    if (tool.tool === "connector") {
      const point = canvasPoint(event.nativeEvent, root, zoom);
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
