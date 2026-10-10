import { EDITOR_CONTROL_SELECTOR, PREVENT_TEXT_EDITING_SELECTOR } from "../../constants";
import type { EditorRuntime } from "../../editor/editor-runtime";
import type { EditorEvent } from "../../managers/events/editor-event";
import { canvasPoint } from "./visuals/utils/canvas-point";
/**
 * Delegated move, resize, and rotate for edgeless cards, visuals, and groups.
 *
 * Pointerdown snapshots attached connectors and snap candidates so pointermove
 * only writes CSS transforms and, when needed, updates reused SVG path `d`
 * attributes. An empty connector snapshot never mounts the live-preview overlay.
 */
import type { EditorElementFrame } from "@chulane/rivto";
import { elementContainsBlock } from "../../elements/block-element-projection";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { getEdgelessRuntime } from "../built-ins/selection/edgeless-runtime";
import { canvasDelta } from "./edgeless-geometry";
import {
  attachedConnectorsForTransform,
  isConnectorEndpoint,
  type ConnectorPreviewTarget,
} from "./edgeless-transform-connectors";
import type { ConnectorRoute, ConnectorTextRotation } from "./visuals/types";
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

const ROOT_SELECTOR = "[data-edgeless-root]";
const OBJECT_SELECTOR = "[data-edgeless-object-kind][data-edgeless-object-id]";
const BLOCK_SELECTOR = "[data-block-id]";
// Bento edge handles are not buttons. Exclude them so card transform does not
// steal pointerdown before the tile can preview a width.
const CONTROL_SELECTOR = `[data-block-content], [data-edgeless-ui], ${EDITOR_CONTROL_SELECTOR}:not([data-edgeless-drag-handle]), ${PREVENT_TEXT_EDITING_SELECTOR}, [contenteditable=true], [data-bento-resize-edge]`;
const RESIZE_CORNERS = new Set<ResizeCorner>(["n", "e", "s", "w", "nw", "ne", "sw", "se"]);
const CONNECTOR_PREVIEW_CLASS = "edgeless-connector-live-preview";
const CONNECTOR_LABEL_CLASS = "edgeless-connector-label";
const CONNECTOR_LABEL_PREVIEW_CLASS = "edgeless-connector-label-preview";
const SVG_NS = "http://www.w3.org/2000/svg";

interface TransformStart {
  /** Mounted occurrence that owns this gesture and its preview. */
  readonly root: HTMLElement;
  readonly kind: "move" | "resize" | "rotate";
  readonly x: number;
  readonly y: number;
  readonly ids: string[];
  readonly frames: Map<string, EditorElementFrame>;
  /** Leaf IDs in this gesture, including group children. */
  readonly moving: ReadonlySet<string>;
  /** Connectors that must live-preview; empty means pointermove skips overlay work. */
  readonly attachedConnectors: readonly ConnectorPreviewTarget[];
  /** Align-snap frames excluding moving leaves, captured once at pointerdown. */
  readonly snapCandidates: readonly EditorElementFrame[];
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

/** Reused SVG path and optional label for one path-rebuild connector. */
interface ConnectorOverlayNode {
  readonly path: SVGPathElement;
  label: HTMLElement | null;
}

/** Adds one delegated move/resize path for cards, visuals, and nested groups. */
export function registerEdgelessTransform(editorRuntime: EditorRuntime): () => void {
  return new EdgelessTransformController(editorRuntime).setup();
}

/** Owns transform gesture state, preview geometry, and commit for one editor runtime. */
export class EdgelessTransformController {
  private readonly selection: ReturnType<typeof getEdgelessRuntime>;

  private start: TransformStart | null = null;
  private previewTargets: HTMLElement[] | null = null;
  private hiddenConnectors: HTMLElement[] = [];
  private translatedConnectors: HTMLElement[] = [];
  private overlayLabels: HTMLElement[] = [];
  private overlaySvg: SVGSVGElement | null = null;
  private overlayNodes = new Map<string, ConnectorOverlayNode>();
  private connectorHosts = new Map<string, HTMLElement | null>();

  private groupChildren = (id: string): string[] => {
    const element = this.editorRuntime.elements.getElement(id);
    return element?.type === "group" && Array.isArray(element.props.children) ? element.props.children.filter((child): child is string => typeof child === "string") : [];
  };
  private parentId = (id: string): string | undefined => this.editorRuntime.elements.getElements().find((element) => this.groupChildren(element.id).includes(id))?.id;
  private rotation = (id: string): number => {
    const element = this.editorRuntime.elements.getElement(id);
    return element?.type !== "block" && element?.type !== "connector" && typeof element?.props.rotation === "number"
      ? normalizeRotation(element.props.rotation)
      : 0;
  };
  private leaves = (ids: readonly string[], seen = new Set<string>()): string[] => ids.flatMap((id): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const children = this.groupChildren(id);
    return children.length ? this.leaves(children, seen) : this.editorRuntime.elements.hasElement(id) ? [id] : [];
  });
  private bounds = (id: string): EditorElementFrame | undefined => {
    const children = this.groupChildren(id);
    const element = this.editorRuntime.elements.getElement(id);
    return children.length ? unionFrames(children.flatMap((child) => this.bounds(child) ?? [])) : element ? rotatedFrameBounds(element.frame, this.rotation(id)) : undefined;
  };
  private transformFrame = (id: string): EditorElementFrame | undefined => this.groupChildren(id).length ? this.bounds(id) : this.editorRuntime.elements.getElement(id)?.frame;
  private rendered = (root: HTMLElement, ids: readonly string[]): HTMLElement[] => {
    const included = new Set([...ids, ...this.leaves(ids)]);
    return [...root.querySelectorAll<HTMLElement>("[data-edgeless-root], [data-edgeless-object-id], [data-edgeless-group-bound-id]")].filter((element) => {
      // Drag handles are chrome inside a frame — never their own transform target.
      if (element.matches("[data-edgeless-drag-handle]")) return false;
      const id = element.dataset.edgelessRoot ?? element.dataset.edgelessObjectId ?? element.dataset.edgelessGroupBoundId ?? "";
      if (!included.has(id)) return false;
      // Connectors are live-previewed from attachments instead of CSS-translated.
      return this.editorRuntime.elements.getElement(id)?.type !== "connector";
    });
  };
  private minSize = (id: string) => this.editorRuntime.elements.getElement(id)?.type === "block" ? { width: 180, height: 100 } : { width: 1, height: 1 };
  private previewFrame = (id: string, active: TransformStart, dx: number, dy: number): EditorElementFrame | undefined => {
    const base = active.frames.get(id) ?? this.transformFrame(id);
    if (!base) return undefined;
    if (active.kind === "move") return { ...base, x: base.x + dx, y: base.y + dy };
    if (active.kind === "rotate") return base;
    const min = this.minSize(id);
    return applyRotatedResize(base, dx, dy, active.corner ?? "se", min.width, min.height, this.rotation(id));
  };
  private targetId = (target: HTMLElement): string => target.dataset.edgelessRoot ?? target.dataset.edgelessObjectId ?? target.dataset.edgelessGroupBoundId ?? "";
  private rotationAt = (root: HTMLElement, active: TransformStart, clientX: number, clientY: number, shiftKey = false): number => {
    const frame = active.frames.get(active.ids[0]!);
    if (!frame) return active.rotation ?? 0;
    const point = canvasPoint({ clientX, clientY }, root);
    const angle = Math.atan2(point.y - frame.y - frame.height / 2, point.x - frame.x - frame.width / 2) * 180 / Math.PI;
    const next = normalizeRotation((active.rotation ?? 0) + angle - (active.pointerAngle ?? angle));
    return shiftKey ? normalizeRotation(Math.round(next / 15) * 15) : next;
  };
  /**
   * Returns the rendered connector host, caching the query for the gesture.
   *
   * @param root - Edgeless viewport.
   * @param id - Connector element ID.
   * @returns Host node, or null when it is not mounted.
   */
  private hostFor = (root: HTMLElement, id: string): HTMLElement | null => {
    if (!this.connectorHosts.has(id)) {
      this.connectorHosts.set(id, root.querySelector<HTMLElement>(`[data-edgeless-object-id="${id}"]`));
    }
    return this.connectorHosts.get(id) ?? null;
  };
  /**
   * Restores connector hosts and removes the reused preview overlay.
   *
   * @returns Nothing.
   */
  private clearConnectorPreview = () => {
    this.hiddenConnectors.forEach((host) => host.style.removeProperty("visibility"));
    this.hiddenConnectors = [];
    this.translatedConnectors.forEach((host) => {
      host.style.removeProperty("transform");
      delete host.dataset.edgelessGeometryLock;
    });
    this.translatedConnectors = [];
    this.overlayLabels.forEach((label) => label.remove());
    this.overlayLabels = [];
    this.overlayNodes.clear();
    this.connectorHosts.clear();
    this.overlaySvg?.remove();
    this.overlaySvg = null;
  };
  /**
   * Creates the connector preview SVG once per gesture, with a persistent defs node.
   *
   * @param root - Edgeless viewport that owns the plane.
   * @returns Connected overlay svg, or null when the plane is missing.
   */
  private ensureOverlay = (root: HTMLElement) => {
    const plane = root.querySelector<HTMLElement>("[data-edgeless-plane]");
    if (!plane) return null;
    if (this.overlaySvg?.isConnected) return this.overlaySvg;
    const svg = root.ownerDocument.createElementNS(SVG_NS, "svg");
    svg.setAttribute("data-edgeless-connector-preview", "true");
    svg.setAttribute("class", CONNECTOR_PREVIEW_CLASS);
    svg.append(root.ownerDocument.createElementNS(SVG_NS, "defs"));
    plane.append(svg);
    this.overlaySvg = svg;
    return svg;
  };
  /**
   * Appends a reusable arrow marker to the overlay defs.
   *
   * @param defs - Overlay defs element.
   * @param id - Marker element ID, stable for the gesture.
   * @param stroke - Fill color matching the connector stroke.
   * @param start - True for the source-end marker.
   * @returns Nothing.
   */
  private appendMarker = (defs: SVGDefsElement, id: string, stroke: string, start: boolean): void => {
    const marker = defs.ownerDocument.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", id);
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", start ? "1" : "7");
    marker.setAttribute("refY", "4");
    marker.setAttribute("orient", start ? "auto-start-reverse" : "auto");
    const tip = defs.ownerDocument.createElementNS(SVG_NS, "path");
    tip.setAttribute("d", "M0 0L8 4L0 8z");
    tip.setAttribute("fill", stroke);
    marker.append(tip);
    defs.append(marker);
  };
  /**
   * Updates live connector previews from the pointerdown snapshot.
   *
   * Empty membership is a no-op so a shape drag never mounts an overlay.
   * Path nodes are created once and then only have `d` / label position written.
   *
   * @param root - Edgeless viewport.
   * @param active - Gesture whose attached connectors were snapshotted at start.
   * @param dx - Preview translation X in canvas units.
   * @param dy - Preview translation Y in canvas units.
   * @returns Nothing.
   */
  private previewAttachedConnectors = (root: HTMLElement, active: TransformStart, dx: number, dy: number) => {
    const attached = active.attachedConnectors;
    if (!attached.length) return;
    for (const item of attached) {
      if (item.kind !== "translate") continue;
      const host = this.hostFor(root, item.id);
      if (!host) continue;
      host.dataset.edgelessGeometryLock = "true";
      host.style.transform = `translate(${dx}px, ${dy}px)`;
      if (!this.translatedConnectors.includes(host)) this.translatedConnectors.push(host);
    }
    const pathItems = attached.filter((item) => item.kind === "path");
    if (!pathItems.length) return;
    const overlay = this.ensureOverlay(root);
    const plane = overlay?.parentElement;
    const defs = overlay?.querySelector<SVGDefsElement>("defs");
    if (!overlay || !plane || !defs) return;
    for (const item of pathItems) {
      const element = this.editorRuntime.elements.getElement(item.id);
      const source = element?.props.source;
      const target = element?.props.target;
      if (!element || !isConnectorEndpoint(source) || !isConnectorEndpoint(target)) continue;
      const sourceBound = source.elementId ? this.bounds(source.elementId) : undefined;
      const targetBound = target.elementId ? this.bounds(target.elementId) : undefined;
      const sourceFrame = source.elementId ? this.previewFrame(source.elementId, active, item.sourceMoves ? dx : 0, item.sourceMoves ? dy : 0) : undefined;
      const targetFrame = target.elementId ? this.previewFrame(target.elementId, active, item.targetMoves ? dx : 0, item.targetMoves ? dy : 0) : undefined;
      const sourceRotation = source.elementId && active.kind === "rotate" && active.ids.includes(source.elementId)
        ? active.previewRotation ?? this.rotation(source.elementId)
        : source.elementId ? this.rotation(source.elementId) : 0;
      const targetRotation = target.elementId && active.kind === "rotate" && active.ids.includes(target.elementId)
        ? active.previewRotation ?? this.rotation(target.elementId)
        : target.elementId ? this.rotation(target.elementId) : 0;
      let nextSource = endpointPoint(source, sourceFrame, sourceRotation);
      let nextTarget = endpointPoint(target, targetFrame, targetRotation);
      if (item.connectorMoves && !source.elementId) nextSource = { x: source.position.x + dx, y: source.position.y + dy };
      if (item.connectorMoves && !target.elementId) nextTarget = { x: target.position.x + dx, y: target.position.y + dy };
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
      let nodes = this.overlayNodes.get(item.id);
      if (!nodes) {
        const host = this.hostFor(root, item.id);
        if (host) {
          host.style.visibility = "hidden";
          this.hiddenConnectors.push(host);
        }
        const stroke = typeof element.props.stroke === "string" ? element.props.stroke : "#52525b";
        const lineStyle = element.props.lineStyle === "dashed" || element.props.lineStyle === "dashed-animated"
          ? element.props.lineStyle
          : "solid";
        const startStyle = element.props.startStyle === "arrow" ? "arrow" : "none";
        const endStyle = element.props.endStyle === "arrow" ? "arrow" : "none";
        const markerEndId = `connector-preview-end-${element.id}`;
        const markerStartId = `connector-preview-start-${element.id}`;
        if (endStyle === "arrow") this.appendMarker(defs, markerEndId, stroke, false);
        if (startStyle === "arrow") this.appendMarker(defs, markerStartId, stroke, true);
        const path = root.ownerDocument.createElementNS(SVG_NS, "path");
        path.setAttribute("data-edgeless-connector-preview-stroke", "true");
        path.setAttribute("data-line-style", lineStyle);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", stroke);
        path.setAttribute("stroke-width", String(typeof element.props.strokeWidth === "number" ? element.props.strokeWidth : 2));
        path.setAttribute("opacity", String(typeof element.props.opacity === "number" ? element.props.opacity : 1));
        path.setAttribute("vector-effect", "non-scaling-stroke");
        if (startStyle === "arrow") path.setAttribute("marker-start", `url(#${markerStartId})`);
        if (endStyle === "arrow") path.setAttribute("marker-end", `url(#${markerEndId})`);
        overlay.append(path);
        nodes = { path, label: null };
        this.overlayNodes.set(item.id, nodes);
      }
      nodes.path.setAttribute("d", d);
      const text = typeof element.props.text === "string" ? element.props.text : "";
      if (!text) continue;
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
      let label = nodes.label;
      if (!label) {
        label = root.ownerDocument.createElement("div");
        label.className = `${CONNECTOR_LABEL_CLASS} ${CONNECTOR_LABEL_PREVIEW_CLASS}`;
        label.dataset.edgelessConnectorPreviewLabel = element.id;
        label.dataset.textRotation = textRotation;
        label.textContent = text;
        label.style.color = typeof element.props.color === "string" ? element.props.color : "#222222";
        label.style.fontFamily = typeof element.props.fontFamily === "string" ? element.props.fontFamily : "inherit";
        label.style.fontSize = typeof element.props.fontSize === "number" ? `${element.props.fontSize}px` : "14px";
        label.style.textAlign = typeof element.props.align === "string" ? element.props.align : "center";
        label.style.zIndex = "2147483639";
        plane.append(label);
        this.overlayLabels.push(label);
        nodes.label = label;
      }
      label.style.left = `${labelAt.x}px`;
      label.style.top = `${labelAt.y}px`;
      label.style.transform = degrees ? `rotate(${degrees}deg)` : "";
    }
  };
  private guidesEqual = (left: readonly SnapGuide[], right: readonly SnapGuide[]) =>
    left.length === right.length && left.every((guide, index) => {
      const other = right[index]!;
      return guide.kind === other.kind && guide.axis === other.axis && guide.position === other.position && guide.from === other.from && guide.to === other.to;
    });
  private clearPreview = (restoreSize = true) => {
    const root = this.start?.root;
    if (!root) return;
    (this.previewTargets ?? this.rendered(root, this.start?.ids ?? [])).forEach((element) => {
      const id = this.targetId(element);
      if (this.rotation(id)) element.style.transform = `rotate(${this.rotation(id)}deg)`;
      else element.style.removeProperty("transform");
      delete element.dataset.edgelessGeometryLock;
      if (this.start?.kind === "resize" && restoreSize) {
        element.style.removeProperty("left");
        element.style.removeProperty("top");
        element.style.removeProperty("width");
        element.style.removeProperty("height");
      }
    });
    this.clearConnectorPreview();
    this.previewTargets = null;
    showSnapGuides(root, []);
    delete root.dataset.transforming;
  };
  private lockGeometry = (root: HTMLElement, ids: readonly string[]) => {
    this.previewTargets = this.rendered(root, ids);
    this.previewTargets.forEach((element) => {
      element.dataset.edgelessGeometryLock = "true";
    });
  };
  private snappedDelta = (root: HTMLElement, active: TransformStart, rawDx: number, rawDy: number, altKey = false) => {
    if (altKey) return { dx: rawDx, dy: rawDy, guides: [] as readonly SnapGuide[] };
    const alignEnabled = root.dataset.edgelessAlign !== "false";
    const snapEnabled = root.dataset.edgelessSnap !== "false";
    if (!alignEnabled && !snapEnabled) return { dx: rawDx, dy: rawDy, guides: [] as readonly SnapGuide[] };
    const candidates = active.snapCandidates;
    const zoom = Number(root.dataset.edgelessZoom) || 1;
    const grid = Number(root.dataset.edgelessGrid) || EDGELESS_GRID_SIZE;
    if (active.kind === "rotate") return { dx: 0, dy: 0, guides: [] as readonly SnapGuide[] };
    if (active.kind === "resize") {
      const id = active.ids[0]!;
      const frame = active.frames.get(id);
      if (!frame) return { dx: rawDx, dy: rawDy, guides: [] as readonly SnapGuide[] };
      const min = this.minSize(id);
      const corner = active.corner ?? "se";
      if (this.rotation(id)) return { dx: rawDx, dy: rawDy, guides: [] as readonly SnapGuide[] };
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
      const frame = active.frames.get(id) ?? this.transformFrame(id);
      return frame ? [rotatedFrameBounds(frame, this.rotation(id))] : [];
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

  private finish = (commit: boolean, eventDetail = 1): boolean => {
    const active = this.start;
    const root = active?.root;
    if (!root || !active) return false;
    const zoom = Number(root.dataset.edgelessZoom) || 1;
    const result = this.snappedDelta(root, active, canvasDelta(active.lastX - active.x, zoom), canvasDelta(active.lastY - active.y, zoom), active.snapDisabled);
    this.clearPreview(!commit); this.start = null;
    if (!commit) return false;
    if (!active.moved) {
      /**
       * Purpose: exit drill-in on a plain click (AFFiNE: leave the child, select the group again).
       * Skip when pointerup is part of a double-click (detail >= 2) so VisualElement can
       * still receive dblclick and enter text/sticky editing.
       */
      if (active.returnToGroup && eventDetail < 2) {
        this.selection.set([active.returnToGroup]);
        return true;
      }
      return false;
    }
    if (active.kind === "rotate") {
      this.editorRuntime.elements.updateElement(active.ids[0]!, { props: { rotation: this.rotationAt(root, active, active.lastX, active.lastY, active.rotationSnapped) } });
      return true;
    }
    if (active.kind === "move" && this.editorRuntime.commands.has("edgeless.selection.move")) { this.editorRuntime.commands.execute("edgeless.selection.move", { dx: result.dx, dy: result.dy }); return true; }
    this.editorRuntime.history.batchUpdates(() => active.ids.forEach((id) => {
      const frame = this.previewFrame(id, active, result.dx, result.dy);
      if (frame) this.editorRuntime.elements.updateElement(id, {
        frame,
        props: this.editorRuntime.elements.getElement(id)?.type === "block" ? { autoHeight: false } : undefined,
      });
    }));
    return true;
  };

  /** @param editorRuntime - Runtime receiving transform events and document commands. */
  constructor(private readonly editorRuntime: EditorRuntime) {
    this.selection = getEdgelessRuntime(editorRuntime);
  }

  /** Starts a permitted move, resize, or rotation gesture. */
  private onPointerDown = ({ raw: event, root }: EditorEvent<"surface", "pointerdown">): boolean => {
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
    const parent = this.parentId(id);
    const current = this.selection.get().items;
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
      const inActiveGroup = Boolean(selectedId && (selectedId === parent || this.parentId(selectedId) === parent));
      if (resize || rotating) {
        // Purpose: scale only the handle's child; group bounds follow children.
        id = childId;
        if (!current.includes(childId)) this.selection.set([childId]);
      } else if (selectedId === childId) {
        // Purpose: allow drag on the drilled child; non-label shapes bounce back to group on click.
        id = childId;
        const kind = this.editorRuntime.elements.getElement(childId)?.type;
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
    const element = this.editorRuntime.elements.getElement(id);
    const hitBlockId = hitBlock?.dataset.blockId ?? "";
    // Nested/indented hits must count: card ranges store roots only, and the
    // row hover strip (::before) often lands on a child block, not the root.
    const movable = !event.target.closest(CONTROL_SELECTOR) && (
      !card ||
      !hitBlock ||
      (element?.type === "block" && elementContainsBlock(this.editorRuntime.blocks, element, this.editorRuntime.blocks.getRootIds(), hitBlockId))
    );
    if (!resize && !rotating && !movable) return false;
    event.stopPropagation();
    const selected = current.includes(id);
    if (primary) {
      // Primary toggles membership only — never start a move (that wiped multi-select
      // when adding a shape to an existing group selection for nested grouping).
      this.selection.set(selected ? current.filter((item) => item !== id) : [...current, id]);
      return true;
    }
    if (!selected) this.selection.set([id]);
    const ids = resize || rotating ? [id] : selected ? [...current] : [id];
    const frames = new Map<string, EditorElementFrame>();
    ids.forEach((item) => {
      const frame = this.transformFrame(item);
      if (frame) frames.set(item, { ...frame });
    });
    // Cache leaf frames so attached connector previews stay accurate for groups.
    const moving = new Set(this.leaves(ids));
    moving.forEach((item) => {
      if (frames.has(item)) return;
      const frame = this.transformFrame(item);
      if (frame) frames.set(item, { ...frame });
    });
    const canvasElements = this.editorRuntime.elements.getElements();
    const kind = rotating ? "rotate" as const : resize ? "resize" as const : "move" as const;
    const attachedConnectors = attachedConnectorsForTransform(canvasElements, moving, new Set(ids), kind);
    const snapCandidates = canvasElements
      .filter((element) => element.type !== "connector" && element.type !== "group" && !moving.has(element.id))
      .map((element) => rotatedFrameBounds(element.frame, this.rotation(element.id)));
    const pointer = rotating ? canvasPoint(event, root) : undefined;
    this.start = {
      root,
      kind,
      x: event.clientX,
      y: event.clientY,
      ids,
      frames,
      moving,
      attachedConnectors,
      snapCandidates,
      corner: resize ? corner ?? "se" : undefined,
      rotation: rotating ? this.rotation(id) : undefined,
      pointerAngle: rotating && frames.get(id)
        ? Math.atan2(
          pointer!.y - frames.get(id)!.y - frames.get(id)!.height / 2,
          pointer!.x - frames.get(id)!.x - frames.get(id)!.width / 2,
        ) * 180 / Math.PI
        : undefined,
      returnToGroup: resize || rotating ? undefined : returnToGroup,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      guides: [],
      snapDisabled: event.altKey,
      rotationSnapped: event.shiftKey,
      previewRotation: rotating ? this.rotation(id) : undefined,
    };
    root.dataset.transforming = this.start.kind;
    // Resize previews write left/top/width/height on the host; lock so React
    // style props cannot clobber the opposite-corner-stable geometry mid-drag.
    if (resize || rotating) this.lockGeometry(root, ids);
    (card ?? object)?.focus({ preventScroll: true });
    return true;
  };

  /** Updates the active transform preview without persisting pointer samples. */
  private onPointerMove = ({ raw: event, root }: EditorEvent<"window", "pointermove">): boolean => {
    const active = this.start;
    if (!active) return false;
    active.lastX = event.clientX; active.lastY = event.clientY;
    if (active.kind === "rotate") {
      active.rotationSnapped = event.shiftKey;
      const next = this.rotationAt(root, active, event.clientX, event.clientY, event.shiftKey);
      active.previewRotation = next;
      active.moved ||= Math.abs(next - (active.rotation ?? 0)) >= .1;
      if (!active.moved) return false;
      this.previewTargets ??= this.rendered(root, active.ids);
      this.previewTargets.forEach((target) => { target.style.transform = `rotate(${next}deg)`; });
      this.previewAttachedConnectors(root, active, 0, 0);
      return true;
    }
    const zoom = Number(root.dataset.edgelessZoom) || 1;
    active.snapDisabled = event.altKey;
    const result = this.snappedDelta(root, active, canvasDelta(event.clientX - active.x, zoom), canvasDelta(event.clientY - active.y, zoom), active.snapDisabled);
    if (!active.moved && Math.hypot(result.dx, result.dy) < 2) return false;
    active.moved = true;
    if (!this.guidesEqual(active.guides, result.guides)) {
      active.guides = result.guides;
      showSnapGuides(root, result.guides);
    }
    this.previewTargets ??= this.rendered(root, active.ids);
    this.previewTargets.forEach((target) => {
      if (active.kind === "move") target.style.transform = `translate(${result.dx}px, ${result.dy}px) rotate(${this.rotation(this.targetId(target))}deg)`;
      else {
        const frame = this.previewFrame(active.ids[0]!, active, result.dx, result.dy);
        if (frame) {
          target.style.left = `${frame.x}px`;
          target.style.top = `${frame.y}px`;
          target.style.width = `${frame.width}px`;
          target.style.height = `${frame.height}px`;
        }
      }
    });
    this.previewAttachedConnectors(root, active, result.dx, result.dy);
    return true;
  };

  /** Installs delegated handlers; extension ownership releases registrations. */
  setup(): () => void {
    this.editorRuntime.events.register({ id: "edgeless.transform.pointer-start", type: "pointerdown", capture: true, mode: "edgeless" }, this.onPointerDown);
    this.editorRuntime.events.register({ id: "edgeless.transform.pointer-move", type: "pointermove", target: "window", mode: "edgeless", passive: false }, this.onPointerMove);
    this.editorRuntime.events.register({ id: "edgeless.transform.pointer-end", type: "pointerup", target: "window", mode: "edgeless" }, ({ raw }) => {
      if (this.start) { this.start.lastX = raw.clientX; this.start.lastY = raw.clientY; }
      return this.finish(true, raw.detail);
    });
    this.editorRuntime.events.register({ id: "edgeless.transform.pointer-cancel", type: "pointercancel", target: "window", mode: "edgeless" }, () => this.finish(false));
    this.editorRuntime.keyboard.register({ id: KEYBOARD_BINDING_IDS.edgelessTransformCancel, keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessTransformCancel], mode: "edgeless", when: () => Boolean(this.start) }, () => this.finish(false));
    return this.clearPreview;
  }
}
