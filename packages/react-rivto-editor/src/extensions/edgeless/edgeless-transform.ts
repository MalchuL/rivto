import { useReactPanel } from "../../hooks/editor/use-react-panel";
import { createElement, useContext, useLayoutEffect, useMemo } from "react";
import { EDITOR_CONTROL_SELECTOR, PREVENT_TEXT_EDITING_SELECTOR } from "../../constants";
import type { ReactPanelApi } from "../../panels/types";
import type { ReactEditorApi } from "../../editor/types";
import type { EditorEvent } from "../../managers/events/editor-event";
import { EdgelessCreationDefaultsContext } from "../../surfaces/edgeless/edgeless-tools-context";
import type { EdgelessCreationDefaults } from "../../managers/elements/edgeless-creation-defaults";
import { SurfaceContext } from "../../surfaces/surface";
import { EdgelessTransformControls } from "./edgeless-transform-controls";
import { ElementGeometry } from "../../elements/element-geometry";
import type { ConnectorOverlayNode, ElementTransformPreview, TransformStart } from "./types";
/**
 * Delegated move, resize, and rotate for edgeless cards, visuals, and groups.
 *
 * Moveable supplies movement, resize, rotation, and snapping geometry.
 * Editor events resolve selection and decide whether a target may start a drag.
 * Gesture start snapshots attached connectors and element frames so pointermove
 * only writes CSS transforms and, when needed, updates reused SVG path `d`
 * attributes. An empty connector snapshot never mounts the live-preview overlay.
 */
import type { EditorElementFrame } from "@chulane/rivto";
import { elementContainsBlock } from "../../elements/block-element-projection";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { getEdgelessRuntime } from "../built-ins/selection/edgeless-runtime";
import {
  attachedConnectorsForTransform,
  isConnectorEndpoint,
  type ConnectorPreviewTarget,
} from "./edgeless-transform-connectors";
import type { ConnectorRoute, ConnectorTextRotation } from "../../elements/visuals/types";
import {
  connectorLabelCssDegrees,
  connectorLabelPoint,
  connectorPath,
  connectorPoints,
  endpointPoint,
  normalizeRotation,
  rotatedFrameBounds,
} from "../../elements/visuals/utils/geometry";

/**
 * Mounts controls only when this view renders an edgeless surface.
 *
 * The controller receives the surface settings session and connects document
 * gestures in a layout effect; page occurrences do not install these controls.
 *
 * @returns Mounted transform controls, or null outside edgeless mode.
 */
function TransformControls() {
  const mode = useContext(SurfaceContext);
  const creationDefaults = useContext(EdgelessCreationDefaultsContext);
  const reactPanel = useReactPanel();
  const controller = useMemo(
    () => new EdgelessTransformController(reactPanel.editor, creationDefaults),
    [reactPanel, creationDefaults],
  );
  // Claim object gestures before the passive marquee selection handlers change selection.
  useLayoutEffect(
    () => (mode === "edgeless" ? controller.setup(reactPanel) : undefined),
    [controller, reactPanel, mode],
  );
  if (mode !== "edgeless") {
    return null;
  }
  return createElement(EdgelessTransformControls, { controller });
}

const ROOT_SELECTOR = "[data-edgeless-root]";
const OBJECT_SELECTOR = "[data-edgeless-object-kind][data-edgeless-object-id]";
const BLOCK_SELECTOR = "[data-block-id]";
// Bento edge handles are not buttons. Exclude them so card transform does not
// steal pointerdown before the tile can preview a width.
const CONTROL_SELECTOR = `[data-block-content], [data-edgeless-ui], ${EDITOR_CONTROL_SELECTOR}, ${PREVENT_TEXT_EDITING_SELECTOR}, [contenteditable=true], [data-bento-resize-edge]`;
const CONNECTOR_PREVIEW_CLASS = "edgeless-connector-live-preview";
const CONNECTOR_LABEL_CLASS = "edgeless-connector-label";
const CONNECTOR_LABEL_PREVIEW_CLASS = "edgeless-connector-label-preview";
const SVG_NS = "http://www.w3.org/2000/svg";

/** Adds one delegated move/resize path for cards, visuals, and nested groups. */
export function registerEdgelessTransform(reactEditor: ReactEditorApi): () => void {
  return reactEditor.extensions.mount(TransformControls);
}

/** Owns transform gesture state, preview geometry, and commit for one mounted panel. */
export class EdgelessTransformController {
  private reactPanel?: ReactPanelApi;
  /**
   * Reads element operations within the transform controller's scope.
   *
   * @returns Panel operations when mounted, otherwise editor-wide operations.
   */
  private get elements() {
    return this.reactPanel?.elements ?? this.reactEditor.elements;
  }
  /**
   * Reads the edgeless selection runtime for the transform controller's scope.
   *
   * @returns The panel or editor edgeless runtime.
   */
  private get selection() {
    return getEdgelessRuntime(this.reactPanel ?? this.reactEditor);
  }

  private controls = new Map<
    ReactPanelApi,
    {
      /**
       * Sets and measures the DOM targets before starting a native drag.
       *
       * @param targets - DOM hosts participating in the transform gesture.
       */
      prepareDrag(targets: HTMLElement[]): void;
      /**
       * Starts transform controls from a native mouse or touch event.
       *
       * @param event - Native or React event supplying the current input.
       */
      dragStart(event: MouseEvent | TouchEvent): void;
      /**
       * Stops an active transform-control gesture.
       */
      stop(): void;
    }
  >();

  /**
   * Registers the mounted view's Moveable instance for drags started by editor selection.
   * @param reactPanel - View whose DOM targets and gestures the controls own.
   * @param controls - Prepares selected hosts, forwards native mouse/touch starts,
   * and stops library tracking on cancellation.
   * @returns Cleanup that cancels this view's gesture and releases the registration.
   */
  registerControls(
    reactPanel: ReactPanelApi,
    controls: {
      /**
       * Sets and measures the DOM targets before starting a native drag.
       *
       * @param targets - DOM hosts participating in the transform gesture.
       */
      prepareDrag(targets: HTMLElement[]): void;
      /**
       * Starts transform controls from a native mouse or touch event.
       *
       * @param event - Native or React event supplying the current input.
       */
      dragStart(event: MouseEvent | TouchEvent): void;
      /**
       * Stops an active transform-control gesture.
       */
      stop(): void;
    },
  ): () => void {
    this.controls.set(reactPanel, controls);
    return () => {
      this.finishControls(reactPanel, false);
      this.controls.delete(reactPanel);
    };
  }

  /**
   * Resolves mounted leaves for Moveable's single or group target.
   * Groups expand recursively; their hit areas follow the preview and are not Moveable targets.
   * @param reactPanel - View supplying the selected element tree.
   * @param root - DOM root restricting the search to this mounted view.
   * @param ids - Selected element or group IDs, in selection order.
   * @returns Unique mounted leaf hosts for the supplied selection; missing elements are skipped.
   */
  getMoveTargets(
    reactPanel: ReactPanelApi,
    root: HTMLElement,
    ids: readonly string[],
  ): HTMLElement[] {
    const leaves = new Set<string>();
    const visit = (id: string) => {
      const element = reactPanel.elements.getElementNode(id);
      if (!element) {
        return;
      }
      if (element.type === "group" && element.childIds.length) {
        element.childIds.forEach(visit);
      } else {
        leaves.add(id);
      }
    };
    ids.forEach(visit);
    return [...root.querySelectorAll<HTMLElement>(OBJECT_SELECTOR)].filter((host) =>
      leaves.delete(host.dataset.edgelessObjectId!),
    );
  }

  /**
   * Checks whether editor selection accepted a move before Moveable begins tracking it.
   * @param reactPanel - View reporting the library's drag-start event.
   * @returns False for content editing, controls, or a gesture owned by another view.
   */
  isMoving(reactPanel: ReactPanelApi): boolean {
    return this.reactPanel === reactPanel && this.start?.kind === "move";
  }

  private start: TransformStart | null = null;
  private previewTargets: HTMLElement[] | null = null;
  private hiddenConnectors: HTMLElement[] = [];
  private translatedConnectors: HTMLElement[] = [];
  private overlayLabels: HTMLElement[] = [];
  private overlaySvg: SVGSVGElement | null = null;
  private overlayNodes = new Map<string, ConnectorOverlayNode>();
  private connectorHosts = new Map<string, HTMLElement | null>();
  private readonly geometry = new ElementGeometry(
    (id) => this.elements.getElementNode(id),
    (id) => this.rotation(id),
  );

  /**
   * Creates gesture controls with optional surface-owned creation settings.
   *
   * @param reactEditor - Runtime receiving transform events and document commands.
   * @param creationDefaults - Settings updated after committed resizes; omitted controls do not remember dimensions.
   */
  constructor(
    private readonly reactEditor: ReactEditorApi,
    private readonly creationDefaults?: EdgelessCreationDefaults | null,
  ) {}

  /**
   * Captures editor state when a Moveable edge or handle starts a move, resize, or rotation.
   * No document writes occur until finishControls commits the final geometry.
   * @param reactPanel - View owning the selected element and its Panel coordinates.
   * @param root - Mounted edgeless viewport containing the target and connector previews.
   * @param id - Selected element or group ID; missing elements and standalone connectors are rejected.
   * Group children are expanded recursively without changing their stored parentage.
   * @param kind - Move, size change, or rotation requested by a library control.
   * @param stop - Stops Moveable's pointer tracking if Escape cancels the gesture.
   * @returns Whether the editor accepted the gesture.
   */
  beginControls(
    reactPanel: ReactPanelApi,
    root: HTMLElement,
    id: string,
    kind: "move" | "resize" | "rotate",
    stop: () => void,
  ): boolean {
    if (this.start) {
      this.finish(false);
    }
    this.reactPanel = reactPanel;
    const element = this.elements.getElementNode(id);
    if (!element || this.reactEditor.elementTypes.get(element.type)?.behavior?.absoluteGeometry) {
      return false;
    }
    const moving = new Set(this.leaves([id]));
    const frames = new Map<string, EditorElementFrame>();
    [id, ...moving].forEach((item) => {
      const frame = this.transformFrame(item);
      if (frame) {
        frames.set(item, { ...frame });
      }
    });
    const groupRotations = new Map<string, number>();
    const visitGroups = (item: string) => {
      const node = this.elements.getElementNode(item);
      if (node?.type !== "group") {
        return;
      }
      groupRotations.set(item, this.rotation(item));
      node.childIds.forEach(visitGroups);
    };
    visitGroups(id);
    this.start = {
      groupRotations,
      root,
      kind,
      stopMoveable: stop,
      ids: [id],
      dx: 0,
      dy: 0,
      moved: false,
      frames,
      moving,
      attachedConnectors: this.connectorTargets(moving, new Set([id]), kind),
    };
    root.dataset.transforming = kind;
    root.focus({ preventScroll: true });
    // Moveable previews write size and transform while left/top stay fixed; lock
    // those styles so React cannot clobber opposite-corner-stable geometry mid-drag.
    this.lockGeometry(root, [id]);
    return true;
  }

  /**
   * Displays geometry computed by Moveable without recording pointer samples.
   * Attached connector previews use the same frame and angle as the HTML target.
   * @param previews - Leaf IDs with their rectangles before center rotation and
   * clockwise angles. Group events supply every child in one call so connectors
   * and group bounds observe the same pointer sample. No document writes occur.
   * @param rotationDelta - Group rotation since gesture start, in clockwise degrees.
   * Nested group angles follow this delta without applying it to children twice.
   */
  previewControls(previews: readonly ElementTransformPreview[], rotationDelta = 0): void {
    const active = this.start;
    if (!active || active.kind === "move") {
      return;
    }
    const next = new Map(previews.map((preview) => [preview.id, preview]));
    const geometry = new ElementGeometry(
      (id) => {
        const node = this.elements.getElementNode(id);
        if (!node) {
          return undefined;
        }
        const preview = next.get(id);
        const groupAngle = active.groupRotations?.get(id);
        const rotation =
          groupAngle === undefined
            ? (preview?.rotation ?? this.rotation(id))
            : groupAngle + rotationDelta;
        return { ...node, frame: preview?.frame ?? node.frame, props: { ...node.props, rotation } };
      },
      (id) => next.get(id)?.rotation,
    );
    active.groupRotations?.forEach((rotation, id) => {
      const frame = geometry.frame(id);
      if (frame) {
        next.set(id, { id, frame, rotation: rotation + rotationDelta });
      }
    });
    active.previews = next;
    active.previewGeometry = geometry;
    active.moved = previews.some(({ id, frame, rotation }) => {
      const initial = active.frames.get(id)!;
      return (
        frame.x !== initial.x ||
        frame.y !== initial.y ||
        frame.width !== initial.width ||
        frame.height !== initial.height ||
        rotation !== this.rotation(id)
      );
    });
    this.previewTargets?.forEach((target) => {
      const id = this.targetId(target);
      const preview = active.previews!.get(id);
      if (!preview) {
        return;
      }
      const { frame, rotation } = preview;
      target.style.width = `${frame.width}px`;
      target.style.height = `${frame.height}px`;
      target.style.transform =
        preview.transform ?? `translate(${frame.x}px, ${frame.y}px) rotate(${rotation}deg)`;
    });
    this.previewAttachedConnectors(active.root, active, 0, 0);
  }

  /**
   * Finishes only a Moveable gesture belonging to the supplied view.
   * Cancellation restores DOM styles; commitment records one history operation.
   * @param reactPanel - View that mounted the Moveable controls.
   * @param commit - False on unmount, pointer cancellation, or explicit cancellation.
   * @param eventDetail - Click count used to preserve double-click text editing.
   */
  finishControls(reactPanel: ReactPanelApi, commit: boolean, eventDetail = 1): void {
    if (this.reactPanel === reactPanel && this.start) {
      this.finish(commit, eventDetail);
    }
  }

  /**
   * Applies a Moveable drag delta to all selected objects and their connector previews.
   * @param dx - Horizontal displacement from gesture start in canvas units, after snapping.
   * @param dy - Vertical displacement from gesture start in canvas units, after snapping.
   */
  previewMove(dx: number, dy: number): void {
    const active = this.start;
    if (!active || active.kind !== "move") {
      return;
    }
    active.dx = dx;
    active.dy = dy;
    active.previewGeometry = new ElementGeometry(
      (id) => {
        const node = this.elements.getElementNode(id);
        const frame = active.frames.get(id);
        return node && frame && active.moving.has(id)
          ? { ...node, frame: { ...frame, x: frame.x + dx, y: frame.y + dy } }
          : node;
      },
      (id) => this.rotation(id),
    );
    if (!active.moved && Math.hypot(dx, dy) < 2) {
      return;
    }
    active.moved = true;
    this.previewTargets?.forEach((target) => {
      const id = this.targetId(target);
      const frame = active.frames.get(id)!;
      target.style.transform = `translate(${frame.x + dx}px, ${frame.y + dy}px) rotate(${this.rotation(id)}deg)`;
    });
    this.previewAttachedConnectors(active.root, active, dx, dy);
  }

  /** Mounts per-view Moveable controls and installs move handlers; destruction cancels previews. */
  setup(reactPanel: ReactPanelApi): () => void {
    const disposers: Array<() => void> = [];
    // Cancelling pointerdown suppresses the mouse events that Moveable tracks.
    disposers.push(
      reactPanel.events.register(
        {
          id: "edgeless.transform.pointer-start",
          type: "pointerdown",
          capture: true,
          preventDefault: false,
          mode: "edgeless",
        },
        this.onPointerDown,
      ),
    );
    disposers.push(
      reactPanel.events.register(
        {
          id: "edgeless.transform.mouse-start",
          type: "mousedown",
          capture: true,
          mode: "edgeless",
        },
        ({ raw, reactPanel }) => {
          if (!this.isMoving(reactPanel)) {
            return false;
          }
          this.controls.get(reactPanel)?.dragStart(raw);
          return true;
        },
      ),
    );
    disposers.push(
      reactPanel.events.register(
        {
          id: "edgeless.transform.touch-start",
          type: "touchstart",
          capture: true,
          mode: "edgeless",
        },
        ({ raw, reactPanel }) => {
          if (!this.isMoving(reactPanel)) {
            return false;
          }
          this.controls.get(reactPanel)?.dragStart(raw);
          return true;
        },
      ),
    );
    disposers.push(
      reactPanel.events.register(
        {
          id: "edgeless.transform.pointer-cancel",
          type: "pointercancel",
          target: "window",
          mode: "edgeless",
        },
        () => this.finish(false),
      ),
    );
    disposers.push(
      reactPanel.keyboard.register(
        {
          id: KEYBOARD_BINDING_IDS.edgelessTransformCancel,
          keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessTransformCancel],
          mode: "edgeless",
          when: () => Boolean(this.start),
        },
        () => this.finish(false),
      ),
    );
    disposers.push(reactPanel.subscribeDeactivation(() => this.finish(false)));
    return () => {
      disposers.reverse().forEach((dispose) => dispose());
      this.finish(false);
      this.clearPreview();
    };
  }

  /**
   * Reads a group's direct child element IDs.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Group children, or an empty list for other or missing elements.
   */
  private groupChildren = (id: string): string[] => {
    const element = this.elements.getElementNode(id);
    return element?.type === "group" && Array.isArray(element.childIds) ? element.childIds : [];
  };
  /**
   * Finds an element's selectable parent without crossing the panel container.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Parent element ID, or undefined at the panel boundary.
   */
  private parentId = (id: string): string | undefined => {
    const parent = this.elements.getParentId(id);
    // The Panel container is outside its selectable element subtree.
    return parent && this.elements.hasElement(parent) ? parent : undefined;
  };
  /**
   * Reads normalized rotation while leaving absolute-geometry types unrotated.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Rotation in degrees, defaulting to zero.
   */
  private rotation = (id: string): number => {
    const element = this.elements.getElementNode(id);
    return !this.reactEditor.elementTypes.get(element?.type ?? "")?.behavior?.absoluteGeometry &&
      typeof element?.props.rotation === "number"
      ? normalizeRotation(element.props.rotation)
      : 0;
  };
  /**
   * Expands groups into existing leaf element IDs without revisiting IDs.
   *
   * @param ids - Selected IDs whose groups are recursively expanded.
   * @param seen - Traversal IDs already visited; updated to suppress duplicates and cycles.
   * @returns Unique reachable leaves; missing elements are omitted.
   */
  private leaves = (ids: readonly string[], seen = new Set<string>()): string[] =>
    ids.flatMap((id): string[] => {
      if (seen.has(id)) {
        return [];
      }
      seen.add(id);
      const children = this.groupChildren(id);
      if (children.length) {
        return this.leaves(children, seen);
      }
      return this.elements.hasElement(id) ? [id] : [];
    });
  /**
   * Computes the element's visual bounds through the geometry resolver.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Axis-aligned bounds, or undefined when geometry is unavailable.
   */
  private bounds = (id: string): EditorElementFrame | undefined => this.geometry.bounds(id);
  /**
   * Reads the geometry used to transform an element.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Transform frame, or undefined when unavailable.
   */
  private transformFrame = (id: string): EditorElementFrame | undefined => this.geometry.frame(id);
  /**
   * Finds rendered hosts for selected elements and their leaves, including hidden connector hosts for resize and rotation.
   *
   * @param root - Mounted surface root, or null when clearing its registration.
   * @param ids - Selected element IDs whose DOM hosts should be collected.
   * @returns DOM hosts participating in the current transform preview.
   */
  private rendered = (root: HTMLElement, ids: readonly string[]): HTMLElement[] => {
    const included = new Set([...ids, ...this.leaves(ids)]);
    return [
      ...root.querySelectorAll<HTMLElement>("[data-edgeless-root], [data-edgeless-object-id]"),
    ].filter((element) => {
      const id = element.dataset.edgelessRoot ?? element.dataset.edgelessObjectId ?? "";
      if (!included.has(id)) {
        return false;
      }
      // Moves draw connectors from their attachments. Rotation and resize must
      // also transform hidden connector hosts because Moveable measures them.
      return (
        this.start?.kind === "rotate" ||
        this.start?.kind === "resize" ||
        this.elements.getElementNode(id)?.type !== "connector"
      );
    });
  };
  /**
   * Reads preview geometry or derives a translated frame for an active move.
   *
   * @param id - Stable ID of the record or registration to access.
   * @param active - Active gesture state or whether the keyboard gesture is enabled.
   * @param dx - Horizontal translation in canvas coordinates.
   * @param dy - Vertical translation in canvas coordinates.
   * @returns Preview frame, or undefined when no base frame exists.
   */
  private previewFrame = (
    id: string,
    active: TransformStart,
    dx: number,
    dy: number,
  ): EditorElementFrame | undefined => {
    const preview = active.previewGeometry?.frame(id);
    if (preview) {
      return preview;
    }
    const base = active.frames.get(id) ?? this.transformFrame(id);
    if (!base) {
      return undefined;
    }
    if (active.kind === "move") {
      return { ...base, x: base.x + dx, y: base.y + dy };
    }
    if (active.kind === "rotate") {
      return base;
    }
    return base;
  };
  /**
   * Reads the persisted element ID associated with a transform host.
   *
   * @param target - DOM host or proxied owner being accessed.
   * @returns Element ID, or an empty string when the host has no marker.
   */
  private targetId = (target: HTMLElement): string =>
    target.dataset.edgelessRoot ?? target.dataset.edgelessObjectId ?? "";
  /**
   * Returns the rendered connector host, caching the query for the gesture.
   *
   * @param root - Edgeless viewport.
   * @param id - Connector element ID.
   * @returns Host node, or null when it is not mounted.
   */
  private hostFor = (root: HTMLElement, id: string): HTMLElement | null => {
    if (!this.connectorHosts.has(id)) {
      this.connectorHosts.set(
        id,
        root.querySelector<HTMLElement>(`[data-edgeless-object-id="${id}"]`),
      );
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
    if (!plane) {
      return null;
    }
    if (this.overlaySvg?.isConnected) {
      return this.overlaySvg;
    }
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
   * The triangle tip at (8, 4) extends one stroke width beyond the path endpoint for both orientations.
   *
   * @param defs - Overlay defs element.
   * @param id - Marker element ID, stable for the gesture.
   * @param stroke - Fill color matching the connector stroke.
   * @param start - True for the source-end marker.
   * @returns Appends the marker with its outward tip offset to the overlay definitions.
   */
  private appendMarker = (
    defs: SVGDefsElement,
    id: string,
    stroke: string,
    start: boolean,
  ): void => {
    const marker = defs.ownerDocument.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", id);
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "7");
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
  private previewAttachedConnectors = (
    root: HTMLElement,
    active: TransformStart,
    dx: number,
    dy: number,
  ) => {
    const attached = active.attachedConnectors;
    if (!attached.length) {
      return;
    }
    for (const item of attached) {
      if (item.kind !== "translate") {
        continue;
      }
      const host = this.hostFor(root, item.id);
      if (!host) {
        continue;
      }
      host.dataset.edgelessGeometryLock = "true";
      host.style.transform = `translate(${dx}px, ${dy}px)`;
      if (!this.translatedConnectors.includes(host)) {
        this.translatedConnectors.push(host);
      }
    }
    const pathItems = attached.filter((item) => item.kind === "path");
    if (!pathItems.length) {
      return;
    }
    const overlay = this.ensureOverlay(root);
    const plane = overlay?.parentElement;
    const defs = overlay?.querySelector<SVGDefsElement>("defs");
    if (!overlay || !plane || !defs) {
      return;
    }
    for (const item of pathItems) {
      const element = this.elements.getElementNode(item.id);
      const source = element?.props.source;
      const target = element?.props.target;
      if (!element || !isConnectorEndpoint(source) || !isConnectorEndpoint(target)) {
        continue;
      }
      const sourceBound = source.elementId ? this.bounds(source.elementId) : undefined;
      const targetBound = target.elementId ? this.bounds(target.elementId) : undefined;
      const sourceFrame = source.elementId
        ? this.previewFrame(
            source.elementId,
            active,
            item.sourceMoves ? dx : 0,
            item.sourceMoves ? dy : 0,
          )
        : undefined;
      const targetFrame = target.elementId
        ? this.previewFrame(
            target.elementId,
            active,
            item.targetMoves ? dx : 0,
            item.targetMoves ? dy : 0,
          )
        : undefined;
      const sourceRotation = source.elementId
        ? (active.previews?.get(source.elementId)?.rotation ?? this.rotation(source.elementId))
        : 0;
      const targetRotation = target.elementId
        ? (active.previews?.get(target.elementId)?.rotation ?? this.rotation(target.elementId))
        : 0;
      const connectorPreview = active.previews?.get(item.id);
      const connectorProps = connectorPreview
        ? this.connectorControlProps(item.id, connectorPreview.frame, connectorPreview.rotation)
        : {};
      const previewSource = isConnectorEndpoint(connectorProps.source)
        ? connectorProps.source
        : source;
      const previewTarget = isConnectorEndpoint(connectorProps.target)
        ? connectorProps.target
        : target;
      let nextSource = endpointPoint(previewSource, sourceFrame, sourceRotation);
      let nextTarget = endpointPoint(previewTarget, targetFrame, targetRotation);
      if (active.kind === "move" && item.connectorMoves && !source.elementId) {
        nextSource = { x: source.position.x + dx, y: source.position.y + dy };
      }
      if (active.kind === "move" && item.connectorMoves && !target.elementId) {
        nextTarget = { x: target.position.x + dx, y: target.position.y + dy };
      }
      const route = (
        typeof element.props.route === "string" ? element.props.route : "straight"
      ) as ConnectorRoute;
      const routeSourceFrame = sourceFrame
        ? rotatedFrameBounds(sourceFrame, sourceRotation)
        : sourceBound;
      const routeTargetFrame = targetFrame
        ? rotatedFrameBounds(targetFrame, targetRotation)
        : targetBound;
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
        const lineStyle =
          element.props.lineStyle === "dashed" || element.props.lineStyle === "dashed-animated"
            ? element.props.lineStyle
            : "solid";
        const startStyle = element.props.startStyle === "arrow" ? "arrow" : "none";
        const endStyle = element.props.endStyle === "arrow" ? "arrow" : "none";
        const markerEndId = `connector-preview-end-${element.id}`;
        const markerStartId = `connector-preview-start-${element.id}`;
        if (endStyle === "arrow") {
          this.appendMarker(defs, markerEndId, stroke, false);
        }
        if (startStyle === "arrow") {
          this.appendMarker(defs, markerStartId, stroke, true);
        }
        const path = root.ownerDocument.createElementNS(SVG_NS, "path");
        path.setAttribute("data-edgeless-connector-preview-stroke", "true");
        path.setAttribute("data-line-style", lineStyle);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", stroke);
        path.setAttribute(
          "stroke-width",
          String(typeof element.props.strokeWidth === "number" ? element.props.strokeWidth : 2),
        );
        path.setAttribute(
          "opacity",
          String(typeof element.props.opacity === "number" ? element.props.opacity : 1),
        );
        path.setAttribute("vector-effect", "non-scaling-stroke");
        if (startStyle === "arrow") {
          path.setAttribute("marker-start", `url(#${markerStartId})`);
        }
        if (endStyle === "arrow") {
          path.setAttribute("marker-end", `url(#${markerEndId})`);
        }
        overlay.append(path);
        nodes = { path, label: null };
        this.overlayNodes.set(item.id, nodes);
      }
      nodes.path.setAttribute("d", d);
      const text = typeof element.props.text === "string" ? element.props.text : "";
      if (!text) {
        continue;
      }
      const textRotation = (
        element.props.textRotation === "90" ||
        element.props.textRotation === "180" ||
        element.props.textRotation === "270" ||
        element.props.textRotation === "along" ||
        element.props.textRotation === "horizontal"
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
        label.style.color =
          typeof element.props.color === "string" ? element.props.color : "#222222";
        label.style.fontFamily =
          typeof element.props.fontFamily === "string" ? element.props.fontFamily : "inherit";
        label.style.fontSize =
          typeof element.props.fontSize === "number" ? `${element.props.fontSize}px` : "14px";
        label.style.textAlign =
          typeof element.props.align === "string" ? element.props.align : "center";
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
  /**
   * Clears transform locks and connector previews, optionally restoring pre-gesture geometry.
   *
   * @param restoreGeometry - Whether to restore original geometry; false retains the committed geometry while releasing locks.
   */
  private clearPreview = (restoreGeometry = true) => {
    const root = this.start?.root;
    if (!root) {
      return;
    }
    (this.previewTargets ?? this.rendered(root, this.start?.ids ?? [])).forEach((element) => {
      const id = this.targetId(element);
      if (this.elements.getElementNode(id)?.type === "connector") {
        // The SVG overlay owns the visible path; discard its target's temporary
        // CSS transform before React renders the committed endpoint geometry.
        const frame = this.start?.frames.get(id);
        if (frame) {
          element.style.left = `${frame.x}px`;
          element.style.top = `${frame.y}px`;
          element.style.width = `${frame.width}px`;
          element.style.height = `${frame.height}px`;
        }
        element.style.removeProperty("transform");
        delete element.dataset.edgelessGeometryLock;
        return;
      }
      // Keep committed handle geometry: React may already have rendered the preview.
      if (restoreGeometry || this.start?.kind === "move") {
        const frame = this.transformFrame(id);
        if (frame) {
          element.style.transform = `translate(${frame.x}px, ${frame.y}px) rotate(${this.rotation(id)}deg)`;
        }
      }
      delete element.dataset.edgelessGeometryLock;
      if (this.start?.kind !== "move" && restoreGeometry) {
        const frame = this.start?.frames.get(id);
        if (frame) {
          element.style.left = "0px";
          element.style.top = "0px";
          element.style.width = `${frame.width}px`;
          element.style.height = `${frame.height}px`;
        }
      }
    });
    this.clearConnectorPreview();
    this.previewTargets = null;
    delete root.dataset.transforming;
  };
  /**
   * Locks selected DOM hosts against React geometry updates during the transform preview.
   *
   * @param root - Mounted surface root, or null when clearing its registration.
   * @param ids - Stable IDs of the elements or blocks to include.
   */
  private lockGeometry = (root: HTMLElement, ids: readonly string[]) => {
    this.previewTargets = this.rendered(root, ids);
    this.previewTargets.forEach((element) => {
      element.dataset.edgelessGeometryLock = "true";
    });
  };
  /**
   * Ends a transform gesture, committing final geometry when requested or restoring the preview on cancellation.
   *
   * @param commit - Whether to commit the gesture; false cancels without creating or updating document entities.
   * @param eventDetail - Native click count; defaults to one and prevents drill-out during double clicks.
   * @returns Whether a gesture was committed, cancelled, or used to return selection to its group.
   */
  private finish = (commit: boolean, eventDetail = 1): boolean => {
    const active = this.start;
    const root = active?.root;
    if (!root || !active) {
      return false;
    }
    // Keep the final absolute translation when releasing the React style lock.
    if (commit && active.previews) {
      this.previewTargets?.forEach((target) => {
        const preview = active.previews!.get(this.targetId(target));
        if (!preview || this.elements.getElementNode(preview.id)?.type === "connector") {
          return;
        }
        target.style.transform = `translate(${preview.frame.x}px, ${preview.frame.y}px) rotate(${preview.rotation}deg)`;
      });
    }
    this.clearPreview(!commit);
    this.start = null;
    if (!commit) {
      active.stopMoveable?.();
      return true;
    }
    if (active.kind !== "move") {
      if (active.moved && active.previews) {
        this.reactEditor.history.batchUpdates(() =>
          this.elements.updateElements(
            [...active.previews!.values()].map(({ id, frame, rotation }) => ({
              id,
              patch: {
                frame: this.groupChildren(id).length ? undefined : frame,
                props: {
                  ...(this.elements.getElementNode(id)?.type === "connector" ? {} : { rotation }),
                  ...(active.kind === "resize" && this.elements.getElementNode(id)?.type === "block"
                    ? { autoHeight: false }
                    : {}),
                  ...this.connectorControlProps(id, frame, rotation),
                },
              },
            })),
          ),
        );
        if (active.kind === "resize") {
          for (const { id } of active.previews.values()) {
            const element = this.elements.getElementNode(id);
            const before = active.frames.get(id);
            if (
              element &&
              before &&
              !this.groupChildren(id).length &&
              (before.width !== element.frame.width || before.height !== element.frame.height)
            ) {
              this.creationDefaults?.remember(element.type, { frame: element.frame });
            }
          }
        }
      }
      return active.moved;
    }
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
    if (this.reactEditor.commands.has("edgeless.selection.move")) {
      this.reactEditor.commands.execute("edgeless.selection.move", {
        reactPanel: this.reactPanel,
        payload: { dx: active.dx, dy: active.dy },
      });
    } else {
      this.reactEditor.history.batchUpdates(() =>
        active.ids.forEach((id) => {
          const frame = this.previewFrame(id, active, active.dx, active.dy);
          if (frame) {
            this.elements.updateElement(id, { frame });
          }
        }),
      );
    }
    return true;
  };

  /** Resolves click/drill-in selection and starts a permitted object move. */
  private onPointerDown = ({
    raw: event,
    root,
    reactPanel,
  }: EditorEvent<"surface", "pointerdown">): boolean => {
    if (event.button !== 0 || !(event.target instanceof Element)) {
      return false;
    }
    if (root.dataset.panningReady === "true" || root.dataset.edgelessPanTool === "true") {
      return false;
    }
    if (event.target.closest("[data-edgeless-ui]")) {
      return false;
    }
    const card = event.target.closest<HTMLElement>(ROOT_SELECTOR);
    const object = event.target.closest<HTMLElement>(OBJECT_SELECTOR);
    let id = card?.dataset.edgelessRoot ?? object?.dataset.edgelessObjectId;
    if (!id) {
      return false;
    }
    this.reactPanel = reactPanel;
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
     * Moveable handles target the concrete selection through beginControls;
     * they do not enter this pointer-based group selection path.
     */
    let returnToGroup: string | undefined;
    if (parent && !primary) {
      const selectedId = current.length === 1 ? current[0] : undefined;
      const inActiveGroup = Boolean(
        selectedId && (selectedId === parent || this.parentId(selectedId) === parent),
      );
      if (selectedId === childId) {
        // Purpose: allow drag on the drilled child; non-label shapes bounce back to group on click.
        id = childId;
        const kind = this.elements.getElementNode(childId)?.type;
        if (!this.reactEditor.elementTypes.get(kind ?? "")?.behavior?.editableLabel) {
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
    const element = this.elements.getElementNode(id);
    const hitBlockId = hitBlock?.dataset.blockId ?? "";
    // Nested/indented hits must count: card ranges store roots only, and the
    // row hover strip (::before) often lands on a child block, not the root.
    const movable =
      !event.target.closest(CONTROL_SELECTOR) &&
      (!card ||
        !hitBlock ||
        (element?.type === "block" &&
          elementContainsBlock(
            reactPanel.blocks,
            element,
            reactPanel.blocks.getRootIds(),
            hitBlockId,
          )));
    if (!movable) {
      return false;
    }
    event.stopPropagation();
    const selected = current.includes(id);
    if (primary) {
      // Primary toggles membership only — never start a move (that wiped multi-select
      // when adding a shape to an existing group selection for nested grouping).
      // Preserve canvas focus for clipboard shortcuts; this click does not start Moveable.
      event.preventDefault();
      root.focus({ preventScroll: true });
      this.selection.set(selected ? current.filter((item) => item !== id) : [...current, id]);
      return true;
    }
    if (!selected) {
      this.selection.set([id]);
    }
    const ids = selected ? [...current] : [id];
    const frames = new Map<string, EditorElementFrame>();
    ids.forEach((item) => {
      const frame = this.transformFrame(item);
      if (frame) {
        frames.set(item, { ...frame });
      }
    });
    // Cache leaf frames so attached connector previews stay accurate for groups.
    const moving = new Set(this.leaves(ids));
    moving.forEach((item) => {
      if (frames.has(item)) {
        return;
      }
      const frame = this.transformFrame(item);
      if (frame) {
        frames.set(item, { ...frame });
      }
    });
    const controls = this.controls.get(reactPanel);
    if (!controls) {
      return false;
    }
    const kind = "move" as const;
    const attachedConnectors = this.connectorTargets(moving, new Set(ids), kind);
    this.start = {
      root,
      kind,
      stopMoveable: controls.stop,
      dx: 0,
      dy: 0,
      ids,
      frames,
      moving,
      attachedConnectors,
      returnToGroup,
      moved: false,
    };
    root.dataset.transforming = this.start.kind;
    root.focus({ preventScroll: true });
    this.lockGeometry(root, ids);
    controls.prepareDrag(this.getMoveTargets(reactPanel, root, ids));
    return true;
  };
  /** Includes ancestor groups whose derived bounds change when a child moves. */
  private connectorTargets(
    moving: ReadonlySet<string>,
    selected: ReadonlySet<string>,
    kind: TransformStart["kind"],
  ): readonly ConnectorPreviewTarget[] {
    const affected = new Set(moving);
    moving.forEach((id) => {
      let parent = this.parentId(id);
      while (parent) {
        affected.add(parent);
        parent = this.parentId(parent);
      }
    });
    return attachedConnectorsForTransform(
      this.elements.getElementNodes(),
      affected,
      selected,
      kind,
    ).map((item) => {
      const node = this.elements.getElementNode(item.id)!;
      const groupEndpoint = [node.props.source, node.props.target].some(
        (endpoint) =>
          isConnectorEndpoint(endpoint) &&
          endpoint.elementId &&
          this.elements.getElementNode(endpoint.elementId)?.type === "group",
      );
      // An ancestor can grow around a moved child rather than translating rigidly.
      return groupEndpoint ? { ...item, kind: "path" } : item;
    });
  }

  /**
   * Maps free connector endpoints into Moveable's resized and rotated frame.
   * Attached endpoints continue to follow their elements; the connector host
   * itself stays unrotated because its path is rendered from absolute endpoints.
   */
  private connectorControlProps(
    id: string,
    frame: EditorElementFrame,
    rotation: number,
  ): Record<string, unknown> {
    const element = this.elements.getElementNode(id);
    if (element?.type !== "connector") {
      return {};
    }
    const base = element.frame;
    const transform = (value: unknown) => {
      if (!isConnectorEndpoint(value) || value.elementId) {
        return value;
      }
      const x = ((value.position.x - base.x) * frame.width) / base.width - frame.width / 2;
      const y = ((value.position.y - base.y) * frame.height) / base.height - frame.height / 2;
      const radians = (rotation * Math.PI) / 180;
      return {
        ...value,
        position: {
          x: frame.x + frame.width / 2 + x * Math.cos(radians) - y * Math.sin(radians),
          y: frame.y + frame.height / 2 + x * Math.sin(radians) + y * Math.cos(radians),
        },
      };
    };
    // Connectors store endpoints, not a rotated HTML host.
    return { source: transform(element.props.source), target: transform(element.props.target) };
  }
}
