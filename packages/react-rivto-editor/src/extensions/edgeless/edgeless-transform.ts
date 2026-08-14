import type { EditorElementFrame } from "@chulane/rivto";
import type { ReactEditor } from "../../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { canvasDelta } from "./edgeless-geometry";
import { getEdgelessRuntime } from "./edgeless-runtime";
import { elementContainsBlock } from "../../surfaces/edgeless/block-elements";
import {
  applyRotatedResize,
  connectorLabelCssDegrees,
  connectorLabelPoint,
  connectorPath,
  connectorPoints,
  EDGELESS_GRID_SIZE,
  endpointPoint,
  normalizeRotation,
  rotatedFrameBounds,
  snapFrame,
  snapMoveToGrid,
  snapResize,
  snapResizeToGrid,
  unionFrames,
  type ResizeCorner,
  type SnapGuide,
} from "./visuals/utils/geometry";
import { showSnapGuides } from "./visuals/utils/snap-guides";
import type { ConnectorEndpoint, ConnectorRoute, ConnectorTextRotation } from "./visuals/types";

const ROOT_SELECTOR = "[data-edgeless-root]";
const OBJECT_SELECTOR = "[data-edgeless-object-kind][data-edgeless-object-id]";
const BLOCK_SELECTOR = "[data-block-id]";
const CONTROL_SELECTOR = "[data-block-content], [data-edgeless-ui], button:not([data-edgeless-drag-handle]), input, textarea, select, a, [contenteditable=true]";
const RESIZE_CORNERS = new Set<ResizeCorner>(["n", "e", "s", "w", "nw", "ne", "sw", "se"]);

interface TransformStart {
  readonly kind: "move" | "resize" | "rotate";
  readonly x: number;
  readonly y: number;
  readonly ids: string[];
  readonly frames: Map<string, EditorElementFrame>;
  readonly corner?: ResizeCorner;
  readonly rotation?: number;
  readonly pointerAngle?: number;
  /**
   * AFFiNE progressive groups: after drilling into a child, a click-without-drag
   * should re-select this parent group (exit drill-in) instead of leaving the child selected.
   */
  readonly returnToGroup?: string;
  lastX: number;
  lastY: number;
  moved: boolean;
  guides: readonly SnapGuide[];
  snapDisabled: boolean;
  rotationSnapped: boolean;
  previewRotation?: number;
}

const isEndpoint = (value: unknown): value is ConnectorEndpoint =>
  Boolean(value && typeof value === "object" && "anchor" in value && "position" in value);

/** Adds one delegated move/resize path for cards, visuals, and nested groups. */
export function registerEdgelessTransform(reactEditor: ReactEditor): () => void {
  const { editor } = reactEditor;
  const selection = getEdgelessRuntime(reactEditor);
  let start: TransformStart | null = null;
  let previewTargets: HTMLElement[] | null = null;
  let hiddenConnectors: HTMLElement[] = [];
  let translatedConnectors: HTMLElement[] = [];
  let overlayLabels: HTMLElement[] = [];
  let overlaySvg: SVGSVGElement | null = null;

  const groupChildren = (id: string): string[] => {
    const element = editor.elements.getElement(id);
    return element?.type === "group" && Array.isArray(element.props.children) ? element.props.children.filter((child): child is string => typeof child === "string") : [];
  };
  const parentId = (id: string): string | undefined => editor.elements.getElements().find((element) => groupChildren(element.id).includes(id))?.id;
  const rotation = (id: string): number => {
    const element = editor.elements.getElement(id);
    return element?.type !== "block" && element?.type !== "connector" && typeof element?.props.rotation === "number"
      ? normalizeRotation(element.props.rotation)
      : 0;
  };
  const leaves = (ids: readonly string[], seen = new Set<string>()): string[] => ids.flatMap((id): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const children = groupChildren(id);
    return children.length ? leaves(children, seen) : editor.elements.getElement(id) ? [id] : [];
  });
  const bounds = (id: string): EditorElementFrame | undefined => {
    const children = groupChildren(id);
    const element = editor.elements.getElement(id);
    return children.length ? unionFrames(children.flatMap((child) => bounds(child) ?? [])) : element ? rotatedFrameBounds(element.frame, rotation(id)) : undefined;
  };
  const transformFrame = (id: string): EditorElementFrame | undefined => groupChildren(id).length ? bounds(id) : editor.elements.getElement(id)?.frame;
  const rendered = (root: HTMLElement, ids: readonly string[]): HTMLElement[] => {
    const included = new Set([...ids, ...leaves(ids)]);
    return [...root.querySelectorAll<HTMLElement>("[data-edgeless-root], [data-edgeless-object-id], [data-edgeless-group-bound-id]")].filter((element) => {
      // Drag handles are chrome inside a frame — never their own transform target.
      if (element.matches("[data-edgeless-drag-handle]")) return false;
      const id = element.dataset.edgelessRoot ?? element.dataset.edgelessObjectId ?? element.dataset.edgelessGroupBoundId ?? "";
      if (!included.has(id)) return false;
      // Connectors are live-previewed from attachments instead of CSS-translated.
      return editor.elements.getElement(id)?.type !== "connector";
    });
  };
  const minSize = (id: string) => editor.elements.getElement(id)?.type === "block" ? { width: 180, height: 100 } : { width: 1, height: 1 };
  const previewFrame = (id: string, active: TransformStart, dx: number, dy: number): EditorElementFrame | undefined => {
    const base = active.frames.get(id) ?? transformFrame(id);
    if (!base) return undefined;
    if (active.kind === "move") return { ...base, x: base.x + dx, y: base.y + dy };
    if (active.kind === "rotate") return base;
    const min = minSize(id);
    return applyRotatedResize(base, dx, dy, active.corner ?? "se", min.width, min.height, rotation(id));
  };
  const targetId = (target: HTMLElement): string => target.dataset.edgelessRoot ?? target.dataset.edgelessObjectId ?? target.dataset.edgelessGroupBoundId ?? "";
  const rotationAt = (root: HTMLElement, active: TransformStart, clientX: number, clientY: number, shiftKey = false): number => {
    const frame = active.frames.get(active.ids[0]!);
    if (!frame) return active.rotation ?? 0;
    const rect = root.getBoundingClientRect();
    const zoom = Number(root.dataset.edgelessZoom) || 1;
    const panX = Number(root.dataset.edgelessPanX) || 0;
    const panY = Number(root.dataset.edgelessPanY) || 0;
    const point = { x: (clientX - rect.left - panX) / zoom, y: (clientY - rect.top - panY) / zoom };
    const angle = Math.atan2(point.y - frame.y - frame.height / 2, point.x - frame.x - frame.width / 2) * 180 / Math.PI;
    const next = normalizeRotation((active.rotation ?? 0) + angle - (active.pointerAngle ?? angle));
    return shiftKey ? normalizeRotation(Math.round(next / 15) * 15) : next;
  };
  const clearConnectorPreview = () => {
    hiddenConnectors.forEach((host) => host.style.removeProperty("visibility"));
    hiddenConnectors = [];
    translatedConnectors.forEach((host) => {
      host.style.removeProperty("transform");
      delete host.dataset.edgelessGeometryLock;
    });
    translatedConnectors = [];
    overlayLabels.forEach((label) => label.remove());
    overlayLabels = [];
    overlaySvg?.replaceChildren();
  };
  const ensureOverlay = (root: HTMLElement) => {
    const plane = root.querySelector<HTMLElement>("[data-edgeless-plane]");
    if (!plane) return null;
    if (overlaySvg?.isConnected) return overlaySvg;
    const svg = root.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("data-edgeless-connector-preview", "true");
    svg.setAttribute("class", "edgeless-connector-live-preview");
    Object.assign(svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      overflow: "visible",
      pointerEvents: "none",
      zIndex: "2147483638",
    });
    plane.append(svg);
    overlaySvg = svg;
    return svg;
  };
  const previewAttachedConnectors = (root: HTMLElement, active: TransformStart, dx: number, dy: number) => {
    const overlay = ensureOverlay(root);
    const plane = overlay?.parentElement;
    if (!overlay || !plane) return;
    const moving = new Set(leaves(active.ids));
    const selected = new Set(active.ids);
    const nextHidden: HTMLElement[] = [];
    const nextTranslated: HTMLElement[] = [];
    const nextLabels: HTMLElement[] = [];
    const labelsById = new Map(
      overlayLabels.flatMap((label) => {
        const id = label.dataset.edgelessConnectorPreviewLabel;
        return id ? [[id, label] as const] : [];
      }),
    );
    const ns = "http://www.w3.org/2000/svg";
    const defs = root.ownerDocument.createElementNS(ns, "defs");
    const paths: SVGPathElement[] = [];
    editor.elements.getElements().forEach((element) => {
      if (element.type !== "connector") return;
      const source = element.props.source;
      const target = element.props.target;
      if (!isEndpoint(source) || !isEndpoint(target)) return;
      const sourceMoves = Boolean(source.elementId && moving.has(source.elementId));
      const targetMoves = Boolean(target.elementId && moving.has(target.elementId));
      const connectorMoves = moving.has(element.id) || selected.has(element.id);
      if (!sourceMoves && !targetMoves && !connectorMoves) return;
      if (!sourceMoves && !targetMoves && source.elementId && target.elementId) return;
      const sourceTranslates = sourceMoves || Boolean(connectorMoves && !source.elementId);
      const targetTranslates = targetMoves || Boolean(connectorMoves && !target.elementId);
      const host = root.querySelector<HTMLElement>(`[data-edgeless-object-id="${element.id}"]`);
      if (active.kind === "move" && sourceTranslates && targetTranslates && host) {
        host.dataset.edgelessGeometryLock = "true";
        host.style.transform = `translate(${dx}px, ${dy}px)`;
        nextTranslated.push(host);
        return;
      }

      const sourceBound = source.elementId ? bounds(source.elementId) : undefined;
      const targetBound = target.elementId ? bounds(target.elementId) : undefined;
      const sourceFrame = source.elementId ? previewFrame(source.elementId, active, sourceMoves ? dx : 0, sourceMoves ? dy : 0) : undefined;
      const targetFrame = target.elementId ? previewFrame(target.elementId, active, targetMoves ? dx : 0, targetMoves ? dy : 0) : undefined;
      const sourceRotation = source.elementId && active.kind === "rotate" && active.ids.includes(source.elementId) ? active.previewRotation ?? rotation(source.elementId) : source.elementId ? rotation(source.elementId) : 0;
      const targetRotation = target.elementId && active.kind === "rotate" && active.ids.includes(target.elementId) ? active.previewRotation ?? rotation(target.elementId) : target.elementId ? rotation(target.elementId) : 0;
      let nextSource = endpointPoint(source, sourceFrame, sourceRotation);
      let nextTarget = endpointPoint(target, targetFrame, targetRotation);
      if (connectorMoves && !source.elementId) nextSource = { x: source.position.x + dx, y: source.position.y + dy };
      if (connectorMoves && !target.elementId) nextTarget = { x: target.position.x + dx, y: target.position.y + dy };

      const route = (typeof element.props.route === "string" ? element.props.route : "straight") as ConnectorRoute;
      const routeSourceFrame = sourceFrame ? rotatedFrameBounds(sourceFrame, sourceRotation) : sourceBound;
      const routeTargetFrame = targetFrame ? rotatedFrameBounds(targetFrame, targetRotation) : targetBound;
      const absPoints = connectorPoints(
        nextSource,
        nextTarget,
        route,
        source.anchor,
        target.anchor,
        routeSourceFrame,
        routeTargetFrame,
      );
      const d = connectorPath(
        nextSource,
        nextTarget,
        route,
        source.anchor,
        target.anchor,
        routeSourceFrame,
        routeTargetFrame,
      );
      if (host) {
        host.style.visibility = "hidden";
        nextHidden.push(host);
      }
      const stroke = typeof element.props.stroke === "string" ? element.props.stroke : "#52525b";
      const lineStyle = element.props.lineStyle === "dashed" || element.props.lineStyle === "dashed-animated"
        ? element.props.lineStyle
        : "solid";
      const startStyle = element.props.startStyle === "arrow" ? "arrow" : "none";
      const endStyle = element.props.endStyle === "arrow" ? "arrow" : "none";
      const markerEndId = `connector-preview-end-${element.id}`;
      const markerStartId = `connector-preview-start-${element.id}`;
      if (endStyle === "arrow") {
        const marker = root.ownerDocument.createElementNS(ns, "marker");
        marker.setAttribute("id", markerEndId);
        marker.setAttribute("markerWidth", "8");
        marker.setAttribute("markerHeight", "8");
        marker.setAttribute("refX", "7");
        marker.setAttribute("refY", "4");
        marker.setAttribute("orient", "auto");
        const tip = root.ownerDocument.createElementNS(ns, "path");
        tip.setAttribute("d", "M0 0L8 4L0 8z");
        tip.setAttribute("fill", stroke);
        marker.append(tip);
        defs.append(marker);
      }
      if (startStyle === "arrow") {
        const marker = root.ownerDocument.createElementNS(ns, "marker");
        marker.setAttribute("id", markerStartId);
        marker.setAttribute("markerWidth", "8");
        marker.setAttribute("markerHeight", "8");
        marker.setAttribute("refX", "1");
        marker.setAttribute("refY", "4");
        marker.setAttribute("orient", "auto-start-reverse");
        const tip = root.ownerDocument.createElementNS(ns, "path");
        tip.setAttribute("d", "M0 0L8 4L0 8z");
        tip.setAttribute("fill", stroke);
        marker.append(tip);
        defs.append(marker);
      }
      const path = root.ownerDocument.createElementNS(ns, "path");
      path.setAttribute("data-edgeless-connector-preview-stroke", "true");
      path.setAttribute("data-line-style", lineStyle);
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", stroke);
      path.setAttribute("stroke-width", String(typeof element.props.strokeWidth === "number" ? element.props.strokeWidth : 2));
      path.setAttribute("opacity", String(typeof element.props.opacity === "number" ? element.props.opacity : 1));
      path.setAttribute("vector-effect", "non-scaling-stroke");
      if (startStyle === "arrow") path.setAttribute("marker-start", `url(#${markerStartId})`);
      if (endStyle === "arrow") path.setAttribute("marker-end", `url(#${markerEndId})`);
      paths.push(path);

      const text = typeof element.props.text === "string" ? element.props.text : "";
      if (text) {
        const textRotation = (
          element.props.textRotation === "90"
          || element.props.textRotation === "180"
          || element.props.textRotation === "270"
          || element.props.textRotation === "along"
          || element.props.textRotation === "horizontal"
            ? element.props.textRotation
            : "horizontal"
        ) as ConnectorTextRotation;
        const labelAt = connectorLabelPoint(absPoints, route);
        const degrees = connectorLabelCssDegrees(absPoints, route, textRotation);
        let label = labelsById.get(element.id);
        if (label) labelsById.delete(element.id);
        else {
          label = root.ownerDocument.createElement("div");
          label.className = "edgeless-connector-label edgeless-connector-label-preview";
          label.dataset.edgelessConnectorPreviewLabel = element.id;
          plane.append(label);
        }
        label.dataset.textRotation = textRotation;
        label.textContent = text;
        Object.assign(label.style, {
          left: `${labelAt.x}px`,
          top: `${labelAt.y}px`,
          color: typeof element.props.color === "string" ? element.props.color : "#222222",
          fontFamily: typeof element.props.fontFamily === "string" ? element.props.fontFamily : "inherit",
          fontSize: typeof element.props.fontSize === "number" ? `${element.props.fontSize}px` : "14px",
          textAlign: typeof element.props.align === "string" ? element.props.align : "center",
          transform: degrees ? `rotate(${degrees}deg)` : "",
          zIndex: "2147483639",
        });
        nextLabels.push(label);
      }
    });
    hiddenConnectors.filter((host) => !nextHidden.includes(host)).forEach((host) => host.style.removeProperty("visibility"));
    hiddenConnectors = nextHidden;
    translatedConnectors.filter((host) => !nextTranslated.includes(host)).forEach((host) => {
      host.style.removeProperty("transform");
      delete host.dataset.edgelessGeometryLock;
    });
    translatedConnectors = nextTranslated;
    labelsById.forEach((label) => label.remove());
    overlayLabels = nextLabels;
    overlay.replaceChildren(defs, ...paths);
  };
  const guidesEqual = (left: readonly SnapGuide[], right: readonly SnapGuide[]) =>
    left.length === right.length && left.every((guide, index) => {
      const other = right[index]!;
      return guide.kind === other.kind && guide.axis === other.axis && guide.position === other.position && guide.from === other.from && guide.to === other.to;
    });
  const clearPreview = (restoreSize = true) => {
    const root = reactEditor.events.getRoot();
    if (!root) return;
    (previewTargets ?? rendered(root, start?.ids ?? [])).forEach((element) => {
      const id = targetId(element);
      if (rotation(id)) element.style.transform = `rotate(${rotation(id)}deg)`;
      else element.style.removeProperty("transform");
      delete element.dataset.edgelessGeometryLock;
      if (start?.kind === "resize" && restoreSize) {
        element.style.removeProperty("left");
        element.style.removeProperty("top");
        element.style.removeProperty("width");
        element.style.removeProperty("height");
      }
    });
    clearConnectorPreview();
    previewTargets = null;
    showSnapGuides(root, []);
    delete root.dataset.transforming;
  };
  const lockGeometry = (root: HTMLElement, ids: readonly string[]) => {
    previewTargets = rendered(root, ids);
    previewTargets.forEach((element) => {
      element.dataset.edgelessGeometryLock = "true";
    });
  };
  const snappedDelta = (root: HTMLElement, active: TransformStart, rawDx: number, rawDy: number, altKey = false) => {
    if (altKey) return { dx: rawDx, dy: rawDy, guides: [] as readonly SnapGuide[] };
    const alignEnabled = root.dataset.edgelessAlign !== "false";
    const snapEnabled = root.dataset.edgelessSnap !== "false";
    if (!alignEnabled && !snapEnabled) return { dx: rawDx, dy: rawDy, guides: [] as readonly SnapGuide[] };
    const excluded = new Set(leaves(active.ids));
    const candidates = editor.elements.getElements().filter((element) => element.type !== "connector" && element.type !== "group" && !excluded.has(element.id)).map((element) => rotatedFrameBounds(element.frame, rotation(element.id)));
    const zoom = Number(root.dataset.edgelessZoom) || 1;
    const grid = Number(root.dataset.edgelessGrid) || EDGELESS_GRID_SIZE;
    if (active.kind === "rotate") return { dx: 0, dy: 0, guides: [] as readonly SnapGuide[] };
    if (active.kind === "resize") {
      const id = active.ids[0]!;
      const frame = active.frames.get(id);
      if (!frame) return { dx: rawDx, dy: rawDy, guides: [] as readonly SnapGuide[] };
      const min = minSize(id);
      const corner = active.corner ?? "se";
      if (rotation(id)) return { dx: rawDx, dy: rawDy, guides: [] as readonly SnapGuide[] };
      let dx = rawDx;
      let dy = rawDy;
      let guides: readonly SnapGuide[] = [];
      if (alignEnabled) {
        const aligned = snapResize(frame, dx, dy, candidates, 8 / zoom, corner, min.width, min.height);
        dx = aligned.dx;
        dy = aligned.dy;
        guides = aligned.guides;
      }
      if (snapEnabled) {
        const locked = { x: guides.some((guide) => guide.axis === "x"), y: guides.some((guide) => guide.axis === "y") };
        ({ dx, dy } = snapResizeToGrid(frame, dx, dy, corner, min.width, min.height, grid, locked));
      }
      return { dx, dy, guides };
    }
    const moving = unionFrames(active.ids.flatMap((id) => {
      const frame = active.frames.get(id) ?? transformFrame(id);
      return frame ? [rotatedFrameBounds(frame, rotation(id))] : [];
    }));
    if (!moving) return { dx: rawDx, dy: rawDy, guides: [] as readonly SnapGuide[] };
    let dx = rawDx;
    let dy = rawDy;
    let guides: readonly SnapGuide[] = [];
    if (alignEnabled) {
      const aligned = snapFrame({ ...moving, x: moving.x + dx, y: moving.y + dy }, candidates, 8 / zoom);
      dx += aligned.dx;
      dy += aligned.dy;
      guides = aligned.guides;
    }
    if (snapEnabled) {
      const locked = { x: guides.some((guide) => guide.axis === "x"), y: guides.some((guide) => guide.axis === "y") };
      ({ dx, dy } = snapMoveToGrid(moving, dx, dy, grid, locked));
    }
    return { dx, dy, guides };
  };

  reactEditor.events.register({ id: "edgeless.transform.pointer-start", type: "pointerdown", capture: true, mode: "edgeless" }, ({ raw: event, root }) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return false;
    if (root.dataset.panningReady === "true" || root.dataset.edgelessTool === "pan") return false;
    const resizeHandle = event.target.closest<HTMLElement>("[data-edgeless-resize-handle]");
    const resize = Boolean(resizeHandle);
    const rotationHandle = event.target.closest<HTMLElement>("[data-edgeless-rotation-handle]");
    const rotating = Boolean(rotationHandle);
    const cornerAttr = resizeHandle?.dataset.edgelessResizeHandle;
    const corner: ResizeCorner | undefined = cornerAttr && RESIZE_CORNERS.has(cornerAttr as ResizeCorner)
      ? cornerAttr as ResizeCorner
      : resize ? "se" : undefined;
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const object = event.target.closest<HTMLElement>(OBJECT_SELECTOR);
    let id = card?.dataset.edgelessRoot ?? object?.dataset.edgelessObjectId;
    if (!id) return false;
    const childId = id;
    const parent = parentId(id);
    const current = selection.get().items;
    const primary = event.ctrlKey || event.metaKey;
    /**
     * AFFiNE-style progressive group selection (single clicks only).
     *
     * Purpose: let users enter a group one level at a time, then edit children,
     * without double-click stack-cycling (which stole dblclick from text/sticky edit).
     *
     * Flow when the hit target is a grouped child and Ctrl/Cmd is not held:
     * 1. Outside drill-in → select the parent group (first click targets the group).
     * 2. Group or a sibling already selected → drill into / switch to this child.
     * 3. This child already selected → keep it for drag/resize; click-without-drag
     *    later returns to the group (except editable labels — text/sticker/shape/connector —
     *    which stay selected so double-click can enter edit mode).
     * Resize handles always target the concrete child, never the whole group.
     */
    let returnToGroup: string | undefined;
    if (parent && !primary) {
      const selectedId = current.length === 1 ? current[0] : undefined;
      const inActiveGroup = Boolean(selectedId && (selectedId === parent || parentId(selectedId) === parent));
      if (resize || rotating) {
        // Purpose: scale only the handle's child; group bounds follow children.
        id = childId;
        if (!current.includes(childId)) selection.set([childId]);
      } else if (selectedId === childId) {
        // Purpose: allow drag on the drilled child; non-label shapes bounce back to group on click.
        id = childId;
        const kind = editor.elements.getElement(childId)?.type;
        if (kind !== "text" && kind !== "sticker" && kind !== "rectangle" && kind !== "ellipse" && kind !== "connector") {
          returnToGroup = parent;
        }
      } else if (inActiveGroup) {
        // Purpose: second click (or sibling click) enters/switches the child under the active group.
        id = childId;
      } else {
        // Purpose: first click on any grouped child selects the group shell first.
        id = parent;
      }
    }
    const hitBlock = event.target.closest<HTMLElement>(BLOCK_SELECTOR);
    const element = editor.elements.getElement(id);
    const hitBlockId = hitBlock?.dataset.blockId ?? "";
    // Nested/indented hits must count: card ranges store roots only, and the
    // row hover strip (::before) often lands on a child block, not the root.
    const movable = !event.target.closest(CONTROL_SELECTOR) && (
      !card ||
      !hitBlock ||
      (element?.type === "block" && elementContainsBlock(editor, element, editor.blocks.getRootIds(), hitBlockId))
    );
    if (!resize && !rotating && !movable) return false;
    event.stopPropagation();
    const selected = current.includes(id);
    if (primary) {
      // Primary toggles membership only — never start a move (that wiped multi-select
      // when adding a shape to an existing group selection for nested grouping).
      selection.set(selected ? current.filter((item) => item !== id) : [...current, id]);
      return true;
    }
    if (!selected) selection.set([id]);
    const ids = resize || rotating ? [id] : selected ? [...current] : [id];
    const frames = new Map<string, EditorElementFrame>();
    ids.forEach((item) => {
      const frame = transformFrame(item);
      if (frame) frames.set(item, { ...frame });
    });
    // Cache leaf frames so attached connector previews stay accurate for groups.
    leaves(ids).forEach((item) => {
      if (frames.has(item)) return;
      const frame = transformFrame(item);
      if (frame) frames.set(item, { ...frame });
    });
    start = {
      kind: rotating ? "rotate" : resize ? "resize" : "move",
      x: event.clientX,
      y: event.clientY,
      ids,
      frames,
      corner: resize ? corner ?? "se" : undefined,
      rotation: rotating ? rotation(id) : undefined,
      pointerAngle: rotating && frames.get(id)
        ? Math.atan2(
          (event.clientY - root.getBoundingClientRect().top - (Number(root.dataset.edgelessPanY) || 0)) / (Number(root.dataset.edgelessZoom) || 1) - frames.get(id)!.y - frames.get(id)!.height / 2,
          (event.clientX - root.getBoundingClientRect().left - (Number(root.dataset.edgelessPanX) || 0)) / (Number(root.dataset.edgelessZoom) || 1) - frames.get(id)!.x - frames.get(id)!.width / 2,
        ) * 180 / Math.PI
        : undefined,
      returnToGroup: resize || rotating ? undefined : returnToGroup,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      guides: [],
      snapDisabled: event.altKey,
      rotationSnapped: event.shiftKey,
      previewRotation: rotating ? rotation(id) : undefined,
    };
    root.dataset.transforming = start.kind;
    // Resize previews write left/top/width/height on the host; lock so React
    // style props cannot clobber the opposite-corner-stable geometry mid-drag.
    if (resize || rotating) lockGeometry(root, ids);
    (card ?? object)?.focus({ preventScroll: true });
    return true;
  });


  reactEditor.events.register({ id: "edgeless.transform.pointer-move", type: "pointermove", target: "window", mode: "edgeless", passive: false }, ({ raw: event, root }) => {
    const active = start;
    if (!active) return false;
    active.lastX = event.clientX; active.lastY = event.clientY;
    if (active.kind === "rotate") {
      active.rotationSnapped = event.shiftKey;
      const next = rotationAt(root, active, event.clientX, event.clientY, event.shiftKey);
      active.previewRotation = next;
      active.moved ||= Math.abs(next - (active.rotation ?? 0)) >= .1;
      if (!active.moved) return false;
      previewTargets ??= rendered(root, active.ids);
      previewTargets.forEach((target) => { target.style.transform = `rotate(${next}deg)`; });
      previewAttachedConnectors(root, active, 0, 0);
      return true;
    }
    const zoom = Number(root.dataset.edgelessZoom) || 1;
    active.snapDisabled = event.altKey;
    const result = snappedDelta(root, active, canvasDelta(event.clientX - active.x, zoom), canvasDelta(event.clientY - active.y, zoom), active.snapDisabled);
    if (!active.moved && Math.hypot(result.dx, result.dy) < 2) return false;
    active.moved = true;
    if (!guidesEqual(active.guides, result.guides)) {
      active.guides = result.guides;
      showSnapGuides(root, result.guides);
    }
    previewTargets ??= rendered(root, active.ids);
    previewTargets.forEach((target) => {
      if (active.kind === "move") target.style.transform = `translate(${result.dx}px, ${result.dy}px) rotate(${rotation(targetId(target))}deg)`;
      else {
        const frame = previewFrame(active.ids[0]!, active, result.dx, result.dy);
        if (frame) {
          target.style.left = `${frame.x}px`;
          target.style.top = `${frame.y}px`;
          target.style.width = `${frame.width}px`;
          target.style.height = `${frame.height}px`;
        }
      }
    });
    previewAttachedConnectors(root, active, result.dx, result.dy);
    return true;
  });

  const finish = (commit: boolean, eventDetail = 1): boolean => {
    const root = reactEditor.events.getRoot(), active = start;
    if (!root || !active) return false;
    const zoom = Number(root.dataset.edgelessZoom) || 1;
    const result = snappedDelta(root, active, canvasDelta(active.lastX - active.x, zoom), canvasDelta(active.lastY - active.y, zoom), active.snapDisabled);
    clearPreview(!commit); start = null;
    if (!commit) return false;
    if (!active.moved) {
      /**
       * Purpose: exit drill-in on a plain click (AFFiNE: leave the child, select the group again).
       * Skip when pointerup is part of a double-click (detail >= 2) so VisualElement can
       * still receive dblclick and enter text/sticky editing.
       */
      if (active.returnToGroup && eventDetail < 2) {
        selection.set([active.returnToGroup]);
        return true;
      }
      return false;
    }
    if (active.kind === "rotate") {
      editor.elements.updateElement(active.ids[0]!, { props: { rotation: rotationAt(root, active, active.lastX, active.lastY, active.rotationSnapped) } });
      return true;
    }
    if (active.kind === "move" && editor.commands.has("edgeless.selection.move")) { editor.execute("edgeless.selection.move", { dx: result.dx, dy: result.dy }); return true; }
    editor.batchUpdates(() => active.ids.forEach((id) => {
      const frame = previewFrame(id, active, result.dx, result.dy);
      if (frame) editor.elements.updateElement(id, {
        frame,
        props: editor.elements.getElement(id)?.type === "block" ? { autoHeight: false } : undefined,
      });
    }));
    return true;
  };
  reactEditor.events.register({ id: "edgeless.transform.pointer-end", type: "pointerup", target: "window", mode: "edgeless" }, ({ raw }) => {
    if (start) { start.lastX = raw.clientX; start.lastY = raw.clientY; }
    return finish(true, raw.detail);
  });
  reactEditor.events.register({ id: "edgeless.transform.pointer-cancel", type: "pointercancel", target: "window", mode: "edgeless" }, () => finish(false));
  reactEditor.keyboard.register({ id: KEYBOARD_BINDING_IDS.edgelessTransformCancel, keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessTransformCancel], mode: "edgeless", when: () => Boolean(start) }, () => finish(false));
  return clearPreview;
}
