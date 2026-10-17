import type { CreateElementInput } from "../../../../managers/elements/types";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EdgelessOperations } from "../../../../managers/elements/edgeless-operations";
import type {
  ConnectorEndpoint,
  ConnectorRoute,
  EdgelessVisualTool,
  VisualFrame,
} from "../../../../elements/visuals/types";
import { canvasPoint, type CanvasPoint } from "../../../../elements/visuals/utils/canvas-point";
import {
  centeredPlaceFrame,
  DEFAULT_PLACE_SIZE,
  snapDraggedFrame,
  snapPlacedFrame,
  type CreationSnapOptions,
} from "../../../../elements/visuals/utils/creation-geometry";
import { padDrawingFrame } from "../../../../elements/visuals/utils/drawing-frame";
import {
  edgeAnchors,
  endpointPoint,
  inflateFrame,
  nearestAnchor,
  pointInRotatedFrame,
  segmentIntersectsRotatedFrame,
} from "../../../../elements/visuals/utils/geometry";
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

/** Candidate attachment point in canvas units, with active hover highlighting. */
export interface ConnectorAnchorMarker {
  x: number;
  y: number;
  active: boolean;
}

/** Receiving element and canvas-space outlines/anchors for connector hover feedback. */
export interface ConnectorHover {
  elementId: string;
  frame: VisualFrame;
  outline: VisualFrame;
  anchors: readonly ConnectorAnchorMarker[];
}

/** Detached connector route preview; endpoints and frames use canvas units, anchors use normalized coordinates. */
export interface ConnectorPreview {
  source: CanvasPoint;
  target: CanvasPoint;
  route: ConnectorRoute;
  sourceAnchor?: { x: number; y: number };
  targetAnchor?: { x: number; y: number };
  sourceFrame?: VisualFrame;
  targetFrame?: VisualFrame;
}

/**
 * Drawing, eraser, connector, and place pointer capture against the plane SVG.
 *
 * Keeps placement, ink, endpoint and erasure feedback local while the pointer moves;
 * release commits creation or deletion through the receiving operations. Cancellation
 * clears drafts, pointer capture and snap guides without committing the gesture.
 * @param props - Mounted panel operations, canvas root, viewport scale factor (1 is 100%)
 * and the active tool configuration. Custom placement requires a registered factory and panel.
 * @returns Local preview data, capture handlers and shared connector hit-testing services.
 * @throws When preparing a custom placement whose factory is absent or returns a different type;
 * factory and operation errors propagate to the caller.
 */
export function useDrawingGesture({
  edgelessOperation,
  root,
  zoom,
  tool,
}: {
  edgelessOperation: EdgelessOperations;
  root: HTMLElement | null;
  zoom: number;
  tool: EdgelessVisualTool;
}) {
  const gesture = useRef<Gesture | null>(null);
  const placement = useRef<{ tool: EdgelessVisualTool; input: CreateElementInput } | null>(null);
  const placementInput = (): CreateElementInput => {
    if (placement.current?.tool === tool) {
      return placement.current.input;
    }
    let input: CreateElementInput;
    if (tool.tool === "element") {
      const creation = edgelessOperation.runtime.elementTypes.get(tool.type)?.creation;
      const panel = edgelessOperation.reactPanel;
      if (!creation || !panel) {
        throw new Error("Element placement requires a registered factory and panel");
      }
      input = creation.create(panel);
      if (input.type !== tool.type) {
        throw new Error("Element creation factory returned a different type");
      }
    } else if (tool.tool === "place") {
      const { tool: toolType, kind, ...props } = tool;
      void toolType;
      input = { type: kind, props };
    } else {
      throw new Error("Current tool does not place an element");
    }
    placement.current = { tool, input };
    return input;
  };
  const captureEl = useRef<SVGSVGElement | null>(null);
  const [preview, setPreview] = useState<CanvasPoint[]>([]);
  const [placePreview, setPlacePreview] = useState<VisualFrame | null>(null);
  const [connectorPreview, setConnectorPreview] = useState<ConnectorPreview | null>(null);
  const [connectorHover, setConnectorHover] = useState<ConnectorHover | null>(null);
  const attachPad = ATTACH_PAD_PX / Math.max(zoom, 0.01);

  const creationCandidates = (): VisualFrame[] =>
    edgelessOperation.elements
      .getElementNodes()
      .filter((element) => element.type !== "connector" && element.type !== "group")
      .map((element) => element.frame);

  const snapOptions = (altKey = false): CreationSnapOptions => ({
    snapToGrid: root?.dataset.edgelessSnap !== "false",
    alignObjects: root?.dataset.edgelessAlign !== "false",
    grid: Number(root?.dataset.edgelessGrid) || undefined,
    threshold: 8 / Math.max(zoom, 0.01),
    disabled: altKey,
  });

  const placedFrame = (point: CanvasPoint, altKey = false) =>
    snapPlacedFrame(
      centeredPlaceFrame(
        point,
        edgelessOperation.getPlaceSize({
          width: placementInput().frame?.width ?? DEFAULT_PLACE_SIZE.width,
          height: placementInput().frame?.height ?? DEFAULT_PLACE_SIZE.height,
        }),
      ),
      creationCandidates(),
      snapOptions(altKey),
    );

  /**
   * Resolves the topmost hit object and its outermost group as an attachment target.
   *
   * @param point - Pointer position in canvas units, including the outside attachment allowance.
   * @returns Topmost hit's outermost eligible group, or the hit itself; undefined when no object is hit.
   */
  const objectAt = (point: CanvasPoint): string | undefined => {
    const candidates = edgelessOperation.elements
      .getElementNodes()
      .filter(
        (element) =>
          element.type !== "connector" &&
          element.type !== "group" &&
          pointInRotatedFrame(
            point,
            inflateFrame(element.frame, attachPad),
            edgelessOperation.getRotation(element.id),
          ),
      )
      .sort((a, b) => b.zIndex - a.zIndex);
    let id = candidates[0]?.id;
    while (id) {
      const parent = edgelessOperation.getParentId(id);
      if (!parent) {
        break;
      }
      id = parent;
    }
    return id;
  };

  const endpoint = (id: string, point: CanvasPoint): ConnectorEndpoint => {
    const frame = edgelessOperation.getFrame(id)!;
    const rotation = edgelessOperation.getRotation(id);
    const anchor = nearestAnchor(frame, point, rotation);
    return {
      elementId: id,
      anchor,
      position: endpointPoint({ anchor, position: point }, frame, rotation),
    };
  };

  /**
   * Builds attachment feedback using the same target resolution as endpoint commitment.
   * Source attachments remain eligible so a gesture can return to its starting anchor and form a loop.
   *
   * @param point - Pointer position in canvas units.
   * @returns Target bounds and anchors, or null when no eligible target is hit.
   */
  const hoverFor = (point: CanvasPoint): ConnectorHover | null => {
    const id = objectAt(point);
    if (!id) {
      return null;
    }
    const frame = edgelessOperation.getFrame(id);
    if (!frame) {
      return null;
    }
    const rotation = edgelessOperation.getRotation(id);
    const nearest = nearestAnchor(frame, point, rotation);
    return {
      elementId: id,
      frame,
      outline: edgelessOperation.getBounds(id) ?? frame,
      anchors: edgeAnchors(frame, rotation).map((anchor) => ({
        x: anchor.x,
        y: anchor.y,
        active: anchor.ax === nearest.x && anchor.ay === nearest.y,
      })),
    };
  };

  const clearErased = () =>
    root?.querySelectorAll<HTMLElement>("[data-edgeless-erase-target]").forEach((element) => {
      delete element.dataset.edgelessEraseTarget;
    });

  const cancelGesture = () => {
    const active = gesture.current;
    if (!active) {
      return false;
    }
    const pointerId = active.pointerId;
    gesture.current = null;
    setPreview([]);
    setConnectorPreview(null);
    clearErased();
    const host = captureEl.current;
    if (host?.hasPointerCapture(pointerId)) {
      host.releasePointerCapture(pointerId);
    }
    if (root) {
      showSnapGuides(root, []);
    }
    placement.current = null;
    setPlacePreview(null);
    return true;
  };

  useEffect(() => {
    if (tool.tool === "connector") {
      return;
    }
    setConnectorHover(null);
  }, [tool]);

  useEffect(() => {
    cancelGesture();
    placement.current = null;
    setPlacePreview(null);
    if (root) {
      showSnapGuides(root, []);
    }
  }, [root, tool]);

  useEffect(() => {
    const dispose = (edgelessOperation.reactPanel ?? edgelessOperation.runtime).keyboard.register(
      {
        id: "edgeless.gesture-cancel",
        keys: ["Escape"],
        mode: "edgeless",
        priority: 40,
        when: () => Boolean(gesture.current),
      },
      () => cancelGesture(),
    );
    const deactivate = edgelessOperation.reactPanel?.subscribeDeactivation(() => cancelGesture());
    return () => {
      dispose();
      deactivate?.();
      cancelGesture();
    };
  }, [edgelessOperation, root]);

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool.tool === "select" || tool.tool === "pan" || event.button !== 0) {
      return;
    }
    const point = canvasPoint(event.nativeEvent, root, zoom);
    const start: Gesture = { pointerId: event.pointerId, points: [point], erased: new Set() };
    if (tool.tool === "connector") {
      const id = objectAt(point);
      if (!id) {
        return;
      }
      start.source = endpoint(id, point);
      setConnectorHover(hoverFor(point));
    }
    gesture.current = start;
    captureEl.current = event.currentTarget;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool.tool === "place" || tool.tool === "element") {
      const snapped = placedFrame(point, event.altKey);
      setPlacePreview(snapped.frame);
      if (root) {
        showSnapGuides(root, snapped.guides);
      }
    } else {
      setPreview([point]);
    }
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
      active.target = targetId ? endpoint(targetId, point) : undefined;
      setConnectorPreview({
        source: active.source!.position,
        target: active.target?.position ?? point,
        route: tool.route,
        sourceAnchor: active.source!.anchor,
        targetAnchor: active.target?.anchor,
        sourceFrame: active.source?.elementId
          ? edgelessOperation.getBounds(active.source.elementId)
          : undefined,
        targetFrame: active.target?.elementId
          ? edgelessOperation.getBounds(active.target.elementId)
          : undefined,
      });
      setConnectorHover(hoverFor(point));
      return;
    }

    if (tool.tool === "place" || tool.tool === "element") {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) {
        const snapped = placedFrame(point, event.altKey);
        setPlacePreview(snapped.frame);
        if (root) {
          showSnapGuides(root, snapped.guides);
        }
        return;
      }
      const start = active.points[0]!;
      active.points.push(point);
      const moved = Math.hypot(point.x - start.x, point.y - start.y) >= 4;
      const snapped = moved
        ? snapDraggedFrame(
            start,
            point,
            creationCandidates(),
            snapOptions(event.altKey),
            event.shiftKey,
          )
        : placedFrame(start, event.altKey);
      setPlacePreview(snapped.frame);
      if (root) {
        showSnapGuides(root, snapped.guides);
      }
      return;
    }

    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const previous = active.points.at(-1)!;
    active.points.push(point);
    if (tool.tool === "eraser") {
      const elements = edgelessOperation.elements
        .getElementNodes()
        .filter((element) => element.type !== "group");
      elements.forEach((element) => {
        if (
          !segmentIntersectsRotatedFrame(
            previous,
            point,
            element.frame,
            edgelessOperation.getRotation(element.id),
          )
        ) {
          return;
        }
        let id = element.id;
        while (edgelessOperation.getParentId(id)) {
          id = edgelessOperation.getParentId(id)!;
        }
        active.erased.add(id);
      });
      root?.querySelectorAll<HTMLElement>("[data-edgeless-object-id]").forEach((element) => {
        if (active.erased.has(element.dataset.edgelessObjectId ?? "")) {
          element.dataset.edgelessEraseTarget = "true";
        }
      });
    } else {
      setPreview([...active.points]);
    }
  };

  const pointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    if (event.type === "pointercancel") {
      cancelGesture();
      return;
    }
    gesture.current = null;
    setPreview([]);
    setPlacePreview(null);
    setConnectorPreview(null);
    clearErased();
    if (root) {
      showSnapGuides(root, []);
    }
    if (tool.tool === "eraser") {
      edgelessOperation.deleteItems([...active.erased]);
    } else if (tool.tool === "connector" && active.source && active.target) {
      edgelessOperation.create({
        kind: "connector",
        source: active.source,
        target: active.target,
        route: tool.route,
      });
    } else if (tool.tool === "drawing" && active.points.length > 1) {
      const strokeWidth = edgelessOperation.getDefaults().drawing.strokeWidth;
      const padded = padDrawingFrame(active.points, strokeWidth, zoom);
      edgelessOperation.create({
        kind: "drawing",
        brush: tool.brush,
        frame: padded.frame,
        points: padded.points,
      });
    } else if (tool.tool === "place" || tool.tool === "element") {
      const start = active.points[0]!;
      const end = active.points.at(-1) ?? start;
      const moved = Math.hypot(end.x - start.x, end.y - start.y) >= 4;
      const frame = moved
        ? snapDraggedFrame(
            start,
            end,
            creationCandidates(),
            snapOptions(event.altKey),
            event.shiftKey,
          ).frame
        : placedFrame(start, event.altKey).frame;
      edgelessOperation.createElement({ ...placementInput(), frame });
      if (moved) {
        edgelessOperation.rememberPlaceSize(frame);
      }
      placement.current = null;
    }
    if (tool.tool === "connector") {
      const point = canvasPoint(event.nativeEvent, root, zoom);
      setConnectorHover(hoverFor(point));
    }
  };

  return {
    preview,
    placePreview,
    placeInput: placement.current?.tool === tool ? placement.current.input : null,
    hidePlacePreview: () => {
      if (!gesture.current) {
        setPlacePreview(null);
      }
    },
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
