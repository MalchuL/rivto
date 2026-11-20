import type { CanvasApi } from "@chulane/rivto-edgeless";
import { useEdgelessCanvas } from "../../surfaces/edgeless/edgeless-tools-context";
import type { CanvasControlHandle } from "@chulane/rivto-edgeless/react";
import { flushSync } from "react-dom";
import { useReactPanel } from "../../hooks/editor/use-react-panel";
import { createElement, useContext, useLayoutEffect, useMemo } from "react";
import { EDITOR_CONTROL_SELECTOR, PREVENT_TEXT_EDITING_SELECTOR } from "../../constants";
import type { PanelInputRegistration, ReactPanelApi } from "../../panels/types";
import type { ReactEditorExtensionApi } from "../../editor/types";
import type { EditorEvent } from "../../managers/events/editor-event";
import { EdgelessCreationDefaultsContext } from "../../surfaces/edgeless/edgeless-tools-context";
import type { EdgelessCreationDefaults } from "../../managers/elements/edgeless-creation-defaults";
import { SurfaceContext } from "../../surfaces/surface";
import { EdgelessTransformControls } from "./edgeless-transform-controls";
import { ElementGeometry } from "../../elements/element-geometry";
import type {
  ConnectorTransformPreview,
  ElementTransformPreview,
  PointerTransformTarget,
  TransformPreviewTarget,
  TransformStart,
  TransformControlsRegistration,
} from "./types";
import type {
  InputRegion,
  InputRegionStyleSession,
  InputRoot,
  InputTarget,
  PointerInput,
} from "@chulane/rivto-root";
import type { CSSProperties } from "react";
import { EDGELESS_TRANSFORMING_ATTRIBUTE } from "../../surfaces/edgeless/markers";
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
  const canvas = useEdgelessCanvas();
  const reactPanel = useReactPanel();
  const controller = useMemo(
    () => new EdgelessTransformController(reactPanel.editor, creationDefaults, canvas),
    [reactPanel, creationDefaults, canvas],
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

/** Adds one delegated move/resize path for cards, visuals, and nested groups. */
export function registerEdgelessTransform(reactEditor: ReactEditorExtensionApi): () => void {
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

  private controls = new Map<ReactPanelApi, TransformControlsRegistration>();

  /**
   * Registers the mounted view's Moveable instance for drags started by editor selection.
   * @param reactPanel - View whose DOM targets and gestures the controls own.
   * @param controls - Prepares selected hosts, starts during browser input delivery,
   * and stops library tracking on cancellation.
   * @param inputRoot - Root borrowed by these controls and any gesture they start.
   * @param inputRegistration - Exact routing lifetime owning these controls.
   * @returns Cleanup that cancels this view's gesture and releases the registration.
   */
  registerControls(
    reactPanel: ReactPanelApi,
    controls: CanvasControlHandle,
    inputRoot: Pick<InputRoot, "isAttached">,
    inputRegistration: PanelInputRegistration,
  ): () => void {
    if (!inputRegistration.isCurrent(inputRoot)) {
      return () => {};
    }
    const registration = { controls, inputRegistration };
    this.controls.set(reactPanel, registration);
    return () => {
      if (this.controls.get(reactPanel) !== registration) {
        return;
      }
      this.controls.delete(reactPanel);
      this.finishControls(reactPanel, false, 1, inputRegistration);
    };
  }

  /**
   * Expands selected groups into concrete leaf identities without requiring mounted DOM.
   * Groups expand recursively; their hit areas follow the preview and are not Moveable targets.
   * @param reactPanel - Occurrence supplying the selected element tree.
   * @param ids - Selected element or group IDs in selection order.
   * @returns Unique existing leaf IDs, including offscreen participants.
   */
  getMoveTargetIds(reactPanel: ReactPanelApi, ids: readonly string[]): string[] {
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
    return [...leaves];
  }

  /**
   * Checks whether editor selection accepted a move before Moveable begins tracking it.
   * @param reactPanel - View reporting the library's drag-start event.
   * @returns False for content editing, controls, or a gesture owned by another view.
   */
  isMoving(reactPanel: ReactPanelApi): boolean {
    const active = this.start;
    return Boolean(
      this.reactPanel === reactPanel &&
      active?.kind === "move" &&
      active.inputRegistration.isCurrent(active.inputRoot),
    );
  }

  private releaseCanvasPins?: () => void;
  private sourceRotations = new Map<string, number>();
  private start: TransformStart | null = null;
  private previewTargets: TransformPreviewTarget[] | null = null;
  private hiddenConnectors = new Map<string, InputRegionStyleSession>();
  private translatedConnectors = new Map<string, TransformPreviewTarget>();
  private connectorPreview: readonly ConnectorTransformPreview[] = [];
  private readonly connectorPreviewListeners = new Set<() => void>();
  private connectorHosts = new Map<string, InputRegion | null>();
  private readonly geometry = new ElementGeometry(
    (id) => this.elements.getElementNode(id),
    (id) => this.rotation(id),
  );

  /**
   * Observes this controller's detached connector preview data.
   *
   * @param listener - Callback notified when transform preview data changes.
   * @returns Disposer removing this subscription.
   */
  subscribeConnectorPreview = (listener: () => void): (() => void) => {
    this.connectorPreviewListeners.add(listener);
    return () => this.connectorPreviewListeners.delete(listener);
  };

  /**
   * Reads the current connector transform preview for this panel occurrence.
   *
   * @returns Stable snapshot until the next preview update or cleanup.
   */
  getConnectorPreview = (): readonly ConnectorTransformPreview[] => this.connectorPreview;

  /**
   * Creates gesture controls with optional surface-owned creation settings.
   *
   * @param reactEditor - Runtime receiving transform events and document commands.
   * @param creationDefaults - Settings updated after committed resizes; omitted controls do not remember dimensions.
   * @param canvas - Surface-owned scene used to pin transform participants, or null outside the surface.
   */
  constructor(
    private readonly reactEditor: ReactEditorExtensionApi,
    private readonly creationDefaults: EdgelessCreationDefaults | null,
    private readonly canvas: Pick<CanvasApi, "pin"> | null,
  ) {}

  /**
   * Captures editor state when a Moveable edge or handle starts a move, resize, or rotation.
   * No document writes occur until finishControls commits the final geometry.
   * @param reactPanel - View owning the selected element and its Panel coordinates.
   * @param inputRoot - Root captured when the controls were rendered.
   * @param ids - Selected element or group IDs; missing elements and standalone connectors are rejected.
   * Group children are expanded recursively without changing their stored parentage.
   * @param kind - Move, size change, or rotation requested by a library control.
   * @param stop - Stops Moveable's pointer tracking if Escape cancels the gesture.
   * @param inputRegistration - Exact routing lifetime captured by the controls.
   * @returns Whether the editor accepted the gesture.
   * @throws Propagates geometry, marker, pinning, focus, and cleanup failures.
   */
  beginControls(
    reactPanel: ReactPanelApi,
    inputRoot:
      Pick<InputRoot, "focus" | "isAttached" | "setTemporaryAttribute" | "findRegions"> | undefined,
    ids: readonly string[],
    kind: "move" | "resize" | "rotate",
    stop: () => void,
    inputRegistration: PanelInputRegistration | undefined,
  ): boolean {
    if (
      !inputRoot ||
      !inputRegistration?.isCurrent(inputRoot) ||
      reactPanel.inputRoot !== inputRoot
    ) {
      return false;
    }
    if (this.start) {
      this.finish(false);
      if (this.start) {
        return false;
      }
    }
    this.reactPanel = reactPanel;
    if (
      !inputRoot.isAttached() ||
      !inputRegistration.isCurrent(inputRoot) ||
      reactPanel.inputRoot !== inputRoot ||
      !ids.length ||
      ids.some((id) => {
        const element = this.elements.getElementNode(id);
        return (
          !element || this.reactEditor.elementTypes.get(element.type)?.behavior?.absoluteGeometry
        );
      })
    ) {
      return false;
    }
    const moving = new Set(this.leaves(ids));
    this.sourceRotations = new Map([...moving].map((id) => [id, this.rotation(id)]));
    flushSync(() => {
      this.releaseCanvasPins = this.canvas?.pin([...moving]);
    });
    const frames = new Map<string, EditorElementFrame>();
    [...ids, ...moving].forEach((item) => {
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
    ids.forEach(visitGroups);
    const releaseTransformMarker = this.acquireTransformMarker(
      reactPanel,
      inputRoot,
      inputRegistration,
      kind,
    );
    if (!releaseTransformMarker) {
      return false;
    }
    this.start = {
      inputRoot,
      inputRegistration,
      groupRotations,
      releaseTransformMarker,
      kind,
      stopMoveable: stop,
      ids: [...ids],
      dx: 0,
      dy: 0,
      moved: false,
      frames,
      moving,
      attachedConnectors: this.connectorTargets(moving, new Set(ids), kind),
    };
    // Moveable previews write size and transform while left/top stay fixed; lock
    // those styles so React cannot clobber opposite-corner-stable geometry mid-drag.
    return this.prepareTransformPreview(reactPanel, inputRoot, ids, kind);
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
    if (!active.inputRegistration.isCurrent(active.inputRoot)) {
      this.finish(false);
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
      const id = target.id;
      const preview = active.previews!.get(id);
      if (!preview) {
        return;
      }
      const { frame, rotation } = preview;
      target.styles.set({
        width: `${frame.width}px`,
        height: `${frame.height}px`,
        transform:
          preview.transform ?? `translate(${frame.x}px, ${frame.y}px) rotate(${rotation}deg)`,
      });
    });
    this.previewAttachedConnectors(active, 0, 0);
  }

  /**
   * Finishes only a Moveable gesture belonging to the supplied view.
   * Cancellation restores DOM styles; commitment records one history operation.
   * @param reactPanel - View that mounted the Moveable controls.
   * @param commit - False on unmount, pointer cancellation, or explicit cancellation.
   * @param eventDetail - Click count used to preserve double-click text editing.
   * @param inputRegistration - When supplied, only finish a gesture from this registration.
   */
  finishControls(
    reactPanel: ReactPanelApi,
    commit: boolean,
    eventDetail = 1,
    inputRegistration?: PanelInputRegistration,
  ): void {
    if (
      this.reactPanel === reactPanel &&
      this.start &&
      (!inputRegistration || this.start.inputRegistration === inputRegistration)
    ) {
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
    if (!active.inputRegistration.isCurrent(active.inputRoot)) {
      this.finish(false);
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
      const id = target.id;
      const frame = active.frames.get(id)!;
      target.styles.set({
        transform: `translate(${frame.x + dx}px, ${frame.y + dy}px) rotate(${this.rotation(id)}deg)`,
      });
    });
    this.previewAttachedConnectors(active, dx, dy);
  }

  /** Mounts per-view Moveable controls and installs move handlers; destruction cancels previews. */
  setup(reactPanel: ReactPanelApi): () => void {
    const disposers: Array<() => void> = [];
    disposers.push(
      reactPanel.editor.subscribe(() => {
        const active = this.start;
        if (!active) {
          return;
        }
        for (const [id, original] of active.frames) {
          const current = this.transformFrame(id);
          if (
            !current ||
            current.x !== original.x ||
            current.y !== original.y ||
            current.width !== original.width ||
            current.height !== original.height ||
            (this.sourceRotations.has(id) && this.rotation(id) !== this.sourceRotations.get(id))
          ) {
            this.finish(false);
            break;
          }
        }
      }),
    );
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
        (delivery) => this.onPointerDown(reactPanel, delivery),
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
        (event) => {
          if (
            !this.isMoving(reactPanel) ||
            this.start?.inputRegistration !== event.inputRegistration
          ) {
            return false;
          }
          this.controls.get(reactPanel)?.controls.dragStart();
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
        (event) => {
          if (
            !this.isMoving(reactPanel) ||
            this.start?.inputRegistration !== event.inputRegistration
          ) {
            return false;
          }
          this.controls.get(reactPanel)?.controls.dragStart();
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
        (event) => event.inputRegistration === this.start?.inputRegistration && this.finish(false),
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
   * Captures rendered participants and connector regions in this occurrence.
   *
   * @param inputRoot - Registration owning the rendered regions.
   * @param ids - Selected element IDs whose previews need geometry locks.
   * @param kind - Gesture deciding whether connector hosts are selected targets.
   * @returns Captured preview targets with their style sessions and lock cleanup.
   * @throws Propagates region lookup, style capture, and marker failures.
   */
  private rendered(
    inputRoot: Pick<InputRoot, "findRegions">,
    ids: readonly string[],
    kind: TransformStart["kind"],
  ): TransformPreviewTarget[] {
    const included = new Set([...ids, ...this.leaves(ids)]);
    const targets: TransformPreviewTarget[] = [];
    this.previewTargets = targets;
    const regions = inputRoot.findRegions(
      "[data-edgeless-root], [data-edgeless-object-id]",
      "[data-rivto-block-editor]",
    );
    for (const region of regions) {
      const objectId = region.readAttribute("data-edgeless-object-id");
      if (objectId && !this.connectorHosts.has(objectId)) {
        this.connectorHosts.set(objectId, region);
      }
      const id = region.readAttribute("data-edgeless-root") ?? objectId;
      if (!id || !included.has(id)) {
        continue;
      }
      // Moves draw connectors from their attachments. Rotation and resize must
      // also transform hidden connector hosts because Moveable measures them.
      if (kind === "move" && this.elements.getElementNode(id)?.type === "connector") {
        continue;
      }
      const styles = region.captureStyles(["left", "top", "width", "height", "transform"]);
      if (styles) {
        try {
          targets.push({
            id,
            styles,
            releaseLock: region.setTemporaryAttribute("data-edgeless-geometry-lock", "true"),
          });
        } catch (error) {
          styles.finish({});
          throw error;
        }
      }
    }
    return targets;
  }
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
   * Restores connector hosts and clears the portal's connector preview.
   *
   * @returns Host styles and cached lookups are cleared and preview subscribers are notified.
   */
  private clearConnectorPreview = () => {
    const hidden = this.hiddenConnectors;
    const translated = this.translatedConnectors;
    this.hiddenConnectors = new Map();
    this.translatedConnectors = new Map();
    this.connectorHosts.clear();
    const errors: unknown[] = [];
    const cleanups = [
      ...[...hidden.values()].map((styles) => () => styles.finish({ visibility: null })),
      ...[...translated.values()].flatMap((target) => [
        () => target.styles.finish({ transform: null }),
        target.releaseLock,
      ]),
      () => this.setConnectorPreview([]),
    ];
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Connector preview cleanup failed");
    }
  };
  /**
   * Updates live connector previews from the pointerdown snapshot.
   *
   * Empty membership is a no-op so a shape drag never mounts an overlay.
   * The renderer receives detached path and label data without a world-layer element.
   *
   * @param active - Gesture whose attached connectors were snapshotted at start.
   * @param dx - Preview translation X in canvas units.
   * @param dy - Preview translation Y in canvas units.
   * @returns Connector host positions and detached preview data reflect the gesture.
   */
  private previewAttachedConnectors = (active: TransformStart, dx: number, dy: number) => {
    const attached = active.attachedConnectors;
    if (!attached.length) {
      return;
    }
    for (const item of attached) {
      if (item.kind !== "translate") {
        continue;
      }
      let target = this.translatedConnectors.get(item.id);
      if (!target) {
        const region = this.connectorHosts.get(item.id);
        const styles = region?.captureStyles(["transform"]);
        if (!region || !styles) {
          continue;
        }
        target = {
          id: item.id,
          styles,
          releaseLock: region.setTemporaryAttribute("data-edgeless-geometry-lock", "true"),
        };
        this.translatedConnectors.set(item.id, target);
      }
      target.styles.set({ transform: `translate(${dx}px, ${dy}px)` });
    }
    const pathItems = attached.filter((item) => item.kind === "path");
    if (!pathItems.length) {
      return;
    }
    const previews: ConnectorTransformPreview[] = [];
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
      if (!this.hiddenConnectors.has(item.id)) {
        const styles = this.connectorHosts.get(item.id)?.captureStyles(["visibility"]);
        if (styles) {
          styles.set({ visibility: "hidden" });
          this.hiddenConnectors.set(item.id, styles);
        }
      }
      const text = typeof element.props.text === "string" ? element.props.text : "";
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
      previews.push({
        id: item.id,
        path: d,
        stroke: typeof element.props.stroke === "string" ? element.props.stroke : "#52525b",
        strokeWidth: typeof element.props.strokeWidth === "number" ? element.props.strokeWidth : 2,
        opacity: typeof element.props.opacity === "number" ? element.props.opacity : 1,
        lineStyle:
          element.props.lineStyle === "dashed" || element.props.lineStyle === "dashed-animated"
            ? element.props.lineStyle
            : "solid",
        startArrow: element.props.startStyle === "arrow",
        endArrow: element.props.endStyle === "arrow",
        label: text
          ? {
              text,
              textRotation,
              x: labelAt.x,
              y: labelAt.y,
              degrees,
              color: typeof element.props.color === "string" ? element.props.color : "#222222",
              fontFamily:
                typeof element.props.fontFamily === "string" ? element.props.fontFamily : "inherit",
              fontSize: typeof element.props.fontSize === "number" ? element.props.fontSize : 14,
              align:
                typeof element.props.align === "string"
                  ? (element.props.align as CSSProperties["textAlign"])
                  : "center",
            }
          : undefined,
      });
    }
    this.setConnectorPreview(previews);
  };

  /**
   * Publishes connector geometry to the isolated preview renderer.
   *
   * @param previews - Detached connector data for this gesture, or an empty array to clear it.
   * @returns Current preview snapshot is replaced and subscribers are notified.
   */
  private setConnectorPreview(previews: readonly ConnectorTransformPreview[]): void {
    if (!previews.length && !this.connectorPreview.length) {
      return;
    }
    this.connectorPreview = previews;
    this.connectorPreviewListeners.forEach((listener) => listener());
  }

  /**
   * Clears transform locks and connector previews, optionally restoring pre-gesture geometry.
   *
   * @param restoreGeometry - Whether to restore original geometry; false retains the committed geometry while releasing locks.
   * @param active - Gesture whose preview is being cleared; defaults to the current gesture.
   * @param releasePins - Releases this gesture's canvas pins before geometry is finalized.
   * @returns Preview targets, connector feedback, and the transform marker have been offered cleanup.
   * @throws A cleanup failure, or an AggregateError when multiple operations fail.
   */
  private clearPreview = (
    restoreGeometry = true,
    active = this.start,
    releasePins?: () => void,
  ) => {
    if (!active) {
      return;
    }
    const capturedTargets = this.previewTargets;
    this.previewTargets = null;
    const errors: unknown[] = [];
    try {
      this.clearConnectorPreview();
    } catch (error) {
      errors.push(error);
    }
    for (const release of [active.releaseTransformMarker, releasePins]) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    for (const target of capturedTargets ?? []) {
      let restoreTarget = restoreGeometry || errors.length > 0;
      try {
        restoreTarget ||= !active.inputRegistration.isCurrent(active.inputRoot);
      } catch (error) {
        errors.push(error);
        restoreTarget = true;
      }
      try {
        this.clearPreviewTarget(target, active, restoreTarget);
      } catch (error) {
        errors.push(error);
      }
    }
    // Moveable remeasures its handles when stopped, so restore every target first.
    errors.push(...this.stopCancelledControls(active, restoreGeometry || errors.length > 0));
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Transform preview cleanup failed");
    }
  };
  /**
   * Captures and locks the selected regions for the transform preview.
   *
   * @param inputRoot - Registration that owns the rendered participants.
   * @param ids - Stable IDs of the elements or blocks to include.
   * @param kind - Gesture determining which connector hosts participate.
   * @returns The controller retains the captured style sessions.
   * @throws Propagates region lookup, style capture, or marker failures.
   */
  private lockGeometry(
    inputRoot: Pick<InputRoot, "findRegions">,
    ids: readonly string[],
    kind: TransformStart["kind"],
  ): void {
    this.previewTargets = this.rendered(inputRoot, ids, kind);
  }
  /**
   * Ends a transform gesture, committing final geometry when requested or restoring the preview on cancellation.
   *
   * @param commit - Whether to commit the gesture; false cancels without creating or updating document entities.
   * @param eventDetail - Native click count; defaults to one and prevents drill-out during double clicks.
   * @returns Whether a gesture was committed, cancelled, or used to return selection to its group.
   * @throws Propagates cleanup, control, model, and command failures.
   */
  private finish = (commit: boolean, eventDetail = 1): boolean => {
    const active = this.start;
    if (!active) {
      return false;
    }
    let shouldCommit: boolean;
    try {
      shouldCommit = commit && active.inputRegistration.isCurrent(active.inputRoot);
    } catch (error) {
      try {
        this.releaseTransformResources(active, false);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Transform cancellation failed");
      }
      throw error;
    }
    this.releaseTransformResources(active, shouldCommit);
    if (!shouldCommit || !active.inputRegistration.isCurrent(active.inputRoot)) {
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

  /**
   * Resolves click and drill-in selection before starting a permitted object move.
   *
   * Pointer admission uses live normalized target queries. Preview presentation
   * remains bound to the captured input registration.
   *
   * @param reactPanel - Panel whose registration owns the transform controls.
   * @param delivery - Normalized pointer input from that panel's registration.
   * @param delivery.pointerInput - Pointer data and synchronous target capabilities.
   * @param delivery.inputRoot - Attachment-bound focus capability.
   * @returns True when the click is consumed or a move has been prepared.
   * @throws Propagates selection, geometry, and control preparation failures.
   */
  private onPointerDown = (
    reactPanel: ReactPanelApi,
    delivery: EditorEvent<"surface", "pointerdown">,
  ): boolean => {
    const { pointerInput: event, inputRoot, inputRegistration } = delivery;
    const target = event?.target;
    if (!Object.is(reactPanel.inputRoot, inputRoot) || !inputRegistration.isCurrent(inputRoot)) {
      return false;
    }
    if (!event || event.button !== 0 || !event.isCurrentRealmElement() || !target) {
      return false;
    }
    if (
      inputRoot.readAttribute("data-panning-ready") === "true" ||
      inputRoot.readAttribute("data-edgeless-pan-tool") === "true" ||
      !Object.is(reactPanel.inputRoot, inputRoot) ||
      !inputRoot.isAttached() ||
      !inputRegistration.isCurrent(inputRoot) ||
      target.hasAncestor("[data-edgeless-ui]")
    ) {
      return false;
    }
    const cardId = target.ancestorAttribute(ROOT_SELECTOR, "data-edgeless-root");
    const objectId = target.ancestorAttribute(OBJECT_SELECTOR, "data-edgeless-object-id");
    const childId = cardId ?? objectId;
    if (!childId) {
      return false;
    }
    this.reactPanel = reactPanel;
    const current = this.selection.get().items;
    const primary = event.ctrlKey || event.metaKey;
    const { id, returnToGroup } = this.resolvePointerTarget(childId, current, primary);
    if (!this.canMovePointerTarget(target, reactPanel, id)) {
      return false;
    }
    event.stopPropagation();
    const selected = current.includes(id);
    if (primary) {
      this.togglePointerSelection(id, current, selected, inputRoot, inputRegistration, event);
      return true;
    }
    if (!selected) {
      this.selection.set([id]);
    }
    if (!inputRegistration.isCurrent(inputRoot)) {
      return true;
    }
    return this.preparePointerMove(
      reactPanel,
      inputRoot,
      inputRegistration,
      selected ? [...current] : [id],
      returnToGroup,
    );
  };

  /**
   * Toggles one object without starting a Moveable gesture.
   *
   * Primary toggles membership only — never start a move (that wiped multi-select
   * when adding a shape to an existing group selection for nested grouping).
   * Preserve canvas focus for clipboard shortcuts; this click does not start Moveable.
   *
   * @param id - Object identity selected by the pointer policy.
   * @param current - Existing selection before the pointer action.
   * @param selected - Whether the object is already selected.
   * @param inputRoot - Attachment-bound focus capability.
   * @param inputRegistration - Routing lifetime captured by the pointer input.
   * @param input - Pointer delivery whose native default is cancelled.
   * @returns Object membership and focus reflect the additive click.
   * @throws Propagates browser focus and selection failures.
   */
  private togglePointerSelection(
    id: string,
    current: readonly string[],
    selected: boolean,
    inputRoot: Pick<InputRoot, "focus" | "isAttached">,
    inputRegistration: PanelInputRegistration,
    input: Pick<PointerInput, "preventDefault">,
  ): void {
    input.preventDefault();
    inputRoot.focus();
    if (inputRegistration.isCurrent(inputRoot)) {
      this.selection.set(selected ? current.filter((item) => item !== id) : [...current, id]);
    }
  }

  /**
   * Resolves progressive group selection for one pointer hit.
   *
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
   *
   * @param childId - Object directly under the pointer.
   * @param current - Current selected object identities.
   * @param primary - Whether additive selection is requested.
   * @returns Selection identity and optional parent for click-without-drag.
   */
  private resolvePointerTarget(
    childId: string,
    current: readonly string[],
    primary: boolean,
  ): PointerTransformTarget {
    const parent = this.parentId(childId);
    if (!parent || primary) {
      return { id: childId };
    }
    const selectedId = current.length === 1 ? current[0] : undefined;
    if (selectedId === childId) {
      // Purpose: allow drag on the drilled child; non-label shapes bounce back to group on click.
      const kind = this.elements.getElementNode(childId)?.type;
      const editable = this.reactEditor.elementTypes.get(kind ?? "")?.behavior?.editableLabel;
      return { id: childId, returnToGroup: editable ? undefined : parent };
    }
    if (selectedId && (selectedId === parent || this.parentId(selectedId) === parent)) {
      // Purpose: second click (or sibling click) enters/switches the child under the active group.
      return { id: childId };
    }
    // Purpose: first click on any grouped child selects the group shell first.
    return { id: parent };
  }

  /**
   * Checks whether a pointer hit can move its selected canvas object.
   *
   * Nested/indented hits must count: card ranges store roots only, and the
   * row hover strip (::before) often lands on a child block, not the root.
   *
   * @param target - Live normalized pointer target queries.
   * @param panel - Receiving panel providing block hierarchy.
   * @param id - Object identity selected by the group policy.
   * @returns False for controls or card block hits outside the selected card.
   */
  private canMovePointerTarget(target: InputTarget, panel: ReactPanelApi, id: string): boolean {
    const card = target.hasAncestor(ROOT_SELECTOR);
    const hitBlock = target.hasAncestor(BLOCK_SELECTOR);
    const element = this.elements.getElementNode(id);
    const blockId = target.ancestorAttribute(BLOCK_SELECTOR, "data-block-id") ?? "";
    return (
      !target.hasAncestor(CONTROL_SELECTOR) &&
      (!card ||
        !hitBlock ||
        (element?.type === "block" &&
          elementContainsBlock(panel.blocks, element, panel.blocks.getRootIds(), blockId)))
    );
  }

  /**
   * Captures source geometry and prepares Moveable for one selected pointer gesture.
   *
   * @param reactPanel - Panel whose controls prepare the selected targets.
   * @param inputRoot - Occurrence capability used to request focus.
   * @param inputRegistration - Routing lifetime that admitted the pointer input.
   * @param ids - Selected top-level object identities to move together.
   * @param returnToGroup - Parent to reselect after a click without dragging.
   * @returns True when controls exist and the move is prepared.
   * @throws Propagates geometry, pinning, focus, or control preparation failures.
   */
  private preparePointerMove(
    reactPanel: ReactPanelApi,
    inputRoot: Pick<InputRoot, "focus" | "setTemporaryAttribute" | "isAttached" | "findRegions">,
    inputRegistration: PanelInputRegistration,
    ids: string[],
    returnToGroup?: string,
  ): boolean {
    const frames = this.capturePointerFrames(ids);
    // Cache leaf frames so attached connector previews stay accurate for groups.
    const moving = new Set(this.leaves(ids));
    moving.forEach((item) => {
      if (!frames.has(item)) {
        const frame = this.transformFrame(item);
        if (frame) {
          frames.set(item, { ...frame });
        }
      }
    });
    const registration = this.controls.get(reactPanel);
    if (
      !registration ||
      registration.inputRegistration !== inputRegistration ||
      !inputRegistration.isCurrent(inputRoot)
    ) {
      return false;
    }
    const controls = registration.controls;
    const kind = "move" as const;
    this.sourceRotations = new Map([...moving].map((id) => [id, this.rotation(id)]));
    flushSync(() => {
      this.releaseCanvasPins = this.canvas?.pin([...moving]);
    });
    const attachedConnectors = this.connectorTargets(moving, new Set(ids), kind);
    const releaseTransformMarker = this.acquireTransformMarker(
      reactPanel,
      inputRoot,
      inputRegistration,
      kind,
    );
    if (!releaseTransformMarker) {
      return false;
    }
    this.start = {
      inputRoot,
      inputRegistration,
      releaseTransformMarker,
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
    return this.prepareTransformPreview(reactPanel, inputRoot, ids, kind, () => {
      controls.prepareDrag(this.getMoveTargetIds(reactPanel, ids));
    });
  }

  /**
   * Focuses the originating occurrence and captures its preview presentation.
   *
   * Failed preparation cancels only the gesture that began this operation.
   *
   * @param panel - Panel receiving this gesture.
   * @param inputRoot - Root captured by the gesture.
   * @param ids - Selected element IDs.
   * @param kind - Requested transform kind.
   * @param prepareControls - Optional synchronous Moveable target preparation.
   * @returns True when the same gesture is still prepared and attached.
   * @throws Propagates preparation failures and combines failed rollback.
   */
  private prepareTransformPreview(
    panel: ReactPanelApi,
    inputRoot: Pick<InputRoot, "focus" | "isAttached" | "findRegions">,
    ids: readonly string[],
    kind: TransformStart["kind"],
    prepareControls?: () => void,
  ): boolean {
    const active = this.start;
    if (!active) {
      return false;
    }
    try {
      inputRoot.focus();
      if (this.start !== active) {
        return false;
      }
      if (panel.inputRoot !== inputRoot || !active.inputRegistration.isCurrent(inputRoot)) {
        this.finish(false);
        return false;
      }
      this.lockGeometry(inputRoot, ids, kind);
      prepareControls?.();
      if (this.start !== active) {
        return false;
      }
      if (panel.inputRoot !== inputRoot || !active.inputRegistration.isCurrent(inputRoot)) {
        this.finish(false);
        return false;
      }
      return true;
    } catch (error) {
      if (this.start === active) {
        try {
          this.finish(false);
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Transform preview preparation failed");
        }
      }
      throw error;
    }
  }

  /**
   * Captures selected frames used by group and connector previews.
   *
   * @param ids - Selected roots whose transforms are moving.
   * @returns Copied frames for every source that currently has geometry.
   */
  private capturePointerFrames(ids: readonly string[]): Map<string, EditorElementFrame> {
    const frames = new Map<string, EditorElementFrame>();
    for (const id of ids) {
      const frame = this.transformFrame(id);
      if (frame) {
        frames.set(id, { ...frame });
      }
    }
    return frames;
  }
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

  /**
   * Restores one preview target and releases its geometry lock.
   *
   * @param target - Captured transform target whose styles were previewed.
   * @param active - Gesture whose captured geometry is being restored.
   * @param restoreGeometry - Whether cancellation should restore the original size.
   * @returns The target's temporary styles and lock reflect the completed gesture.
   * @throws Propagates model reads and browser style mutation failures.
   */
  private clearPreviewTarget(
    target: TransformPreviewTarget,
    active: TransformStart,
    restoreGeometry: boolean,
  ): void {
    const { id } = target;
    const styles: Record<string, string | null> = {};
    if (this.elements.getElementNode(id)?.type === "connector") {
      // The SVG overlay owns the visible path; discard its target's temporary
      // CSS transform before React renders the committed endpoint geometry.
      const frame = active.frames.get(id);
      if (frame) {
        styles.left = `${frame.x}px`;
        styles.top = `${frame.y}px`;
        styles.width = `${frame.width}px`;
        styles.height = `${frame.height}px`;
      }
      styles.transform = null;
    } else {
      // Keep committed handle geometry: React may already have rendered the preview.
      if (restoreGeometry || active.kind === "move") {
        const frame = this.transformFrame(id);
        if (frame) {
          styles.transform = `translate(${frame.x}px, ${frame.y}px) rotate(${this.rotation(id)}deg)`;
        }
      }
      if (active.kind !== "move" && restoreGeometry) {
        const frame = active.frames.get(id);
        if (frame) {
          styles.left = "0px";
          styles.top = "0px";
          styles.width = `${frame.width}px`;
          styles.height = `${frame.height}px`;
        }
      }
    }
    try {
      target.styles.finish(styles);
    } finally {
      target.releaseLock();
    }
  }

  /**
   * Releases preview, pin, and cancelled control resources for a gesture.
   *
   * @param active - Gesture whose resources are being released.
   * @param commit - Whether preview geometry will be committed.
   * @returns All relevant cleanup operations have been attempted.
   * @throws A cleanup failure, or an AggregateError when multiple operations fail.
   */
  private releaseTransformResources(active: TransformStart, commit: boolean): void {
    const errors: unknown[] = [];
    this.start = null;
    const releasePins = this.releaseCanvasPins;
    this.releaseCanvasPins = undefined;
    try {
      // Keep the final absolute translation when releasing the React style lock.
      if (commit && active.previews) {
        this.previewTargets?.forEach((target) => {
          const preview = active.previews!.get(target.id);
          if (!preview || this.elements.getElementNode(preview.id)?.type === "connector") {
            return;
          }
          target.styles.set({
            transform: `translate(${preview.frame.x}px, ${preview.frame.y}px) rotate(${preview.rotation}deg)`,
          });
        });
      }
    } catch (error) {
      errors.push(error);
    }
    try {
      this.clearPreview(!commit || errors.length > 0, active, releasePins);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Transform cleanup failed");
    }
  }

  /**
   * Acquires the gesture marker for the current registration after pinning its targets.
   *
   * If registration changes or acquisition fails, the marker and canvas pins
   * are released before the gesture is abandoned.
   *
   * @param panel - Panel whose current input registration owns the gesture.
   * @param inputRoot - Root captured before preparing the gesture.
   * @param inputRegistration - Routing lifetime captured before preparing the gesture.
   * @param kind - Move, resize, or rotation marker to publish.
   * @returns Marker cleanup, or undefined when the registration is no longer current.
   * @throws Propagates acquisition and cleanup failures, combining multiple errors.
   */
  private acquireTransformMarker(
    panel: Pick<ReactPanelApi, "inputRoot">,
    inputRoot: Pick<InputRoot, "isAttached" | "setTemporaryAttribute">,
    inputRegistration: PanelInputRegistration,
    kind: TransformStart["kind"],
  ): (() => void) | undefined {
    let release: (() => void) | undefined;
    let current: boolean;
    try {
      release = inputRoot.setTemporaryAttribute(EDGELESS_TRANSFORMING_ATTRIBUTE, kind);
      current =
        panel.inputRoot === inputRoot &&
        inputRegistration.isCurrent(inputRoot) &&
        panel.inputRoot === inputRoot;
    } catch (error) {
      this.cleanupTransformPreparation(release, [error]);
      return undefined;
    }
    if (!current) {
      this.cleanupTransformPreparation(release);
      return undefined;
    }
    return release;
  }

  /**
   * Releases an abandoned marker and canvas pins even when either cleanup fails.
   *
   * @param releaseMarker - Marker cleanup, omitted when acquisition failed first.
   * @param errors - Earlier acquisition errors to preserve with cleanup failures.
   * @returns Preparation resources have been offered cleanup.
   * @throws The original failure, or an AggregateError when multiple operations fail.
   */
  private cleanupTransformPreparation(releaseMarker?: () => void, errors: unknown[] = []): void {
    const releasePins = this.releaseCanvasPins;
    this.releaseCanvasPins = undefined;
    for (const release of [releaseMarker, releasePins]) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Transform preparation cleanup failed");
    }
  }

  /**
   * Stops cancelled controls after their target geometry has been restored.
   *
   * Cleanup may synchronously start a replacement that reuses the control handle.
   * Its tracking must not be stopped by the older gesture's cleanup.
   *
   * @param active - Gesture whose resources are being released.
   * @param cancel - Whether earlier cleanup already requires cancellation.
   * @returns Failures collected after all applicable cleanup attempts.
   */
  private stopCancelledControls(
    active: TransformStart,
    cancel: boolean,
  ): unknown[] {
    const errors: unknown[] = [];
    try {
      cancel ||= errors.length > 0 || !active.inputRegistration.isCurrent(active.inputRoot);
    } catch (error) {
      errors.push(error);
      cancel = true;
    }
    if (cancel && (!this.start || this.start.stopMoveable !== active.stopMoveable)) {
      try {
        active.stopMoveable?.();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }
}
