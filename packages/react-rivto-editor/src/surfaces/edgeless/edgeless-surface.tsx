import { EdgelessGridSpotlight } from "./edgeless-grid-spotlight";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import { BlockEditorScope } from "@chulane/rivto-page";
import { CanvasView, useCanvasCamera, useCanvasVisible } from "@chulane/rivto-edgeless/react";
import { useEdgelessCanvas } from "./edgeless-tools-context";
import { EdgelessToolsProvider } from "./edgeless-tools-context";
import type { CanvasApi } from "@chulane/rivto-edgeless";
import { EdgelessSurfaceController } from "./edgeless-surface-controller";
import { SurfaceBoundary } from "../surface";
import { EdgelessSurfaceRegistration } from "./register";
/**
 * React surface for the zoomable edgeless canvas.
 *
 * Connects independent viewport state and browser gestures with the projection
 * of canonical block elements. Persisted document mutations stay in core
 * managers; camera state belongs to Canvas and editor pointer visuals remain here.
 */
import { memo, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { UI_SCOPE_CLASS } from "../../components/ui-scope";
import {
  blockIdsOf,
  blockElementRoot,
  EDGELESS_BLOCK_ELEMENT_TYPE,
  EDGELESS_CARD_DEFAULT_FRAME,
} from "../../elements/block-element-projection";
import { useEditorRoot, useReactPanel, useElements, useRootBlockIds } from "../../hooks";
import { ToolBarDivider } from "../../components/edgeless/tool-bar-divider";
import { EdgelessToolButton } from "../../components/edgeless/tool-button";
import { EDGELESS_GRID_SIZE } from "../../elements/visuals/utils/geometry";
import { EdgelessBlockElement } from "./edgeless-block";
import type { EdgelessSurfaceOptions } from "./types";
import { EdgelessSnappingStore } from "@chulane/rivto-edgeless";

const GRID_SPOTLIGHT_CLASS = "edgeless-grid-spotlight";
/** Bottom-left zoom and snapping cluster; `edgeless-zoom-controls` is a stable hook. */
const ZOOM_CONTROLS_CLASS = `${UI_SCOPE_CLASS} edgeless-zoom-controls absolute bottom-3.5 left-3 z-20 flex w-max items-center gap-0.5 rounded-[11px] border border-border bg-background/95 p-1 shadow-(--rivto-edgeless-chrome-shadow)`;
const ZOOM_VALUE_CLASS = "w-13 min-w-13";

/**
 * Projects root block layouts onto an unbounded, zoomable canvas.
 *
 * CanvasView owns viewport gestures and their mounted DOM listeners. When a
 * surface is replaced, its root registration and the independent viewport
 * release their document and window listeners rather than leaving them behind.
 */
/**
 * Creates a surface-owned editor session using configured or explicitly supplied settings.
 *
 * @param props - Optional local canvas settings overriding the registered defaults.
 * @returns Explicit canvas with its extension UI and independently owned tool session.
 */
export function EdgelessSurface(props: EdgelessSurfaceOptions = {}) {
  const editor = useReactPanel();
  const configured = EdgelessSurfaceRegistration.getOptions(editor.editor.surfaces);
  const suppliedSnapping = props.snapping ?? configured.snapping;
  const snapping = useMemo(
    () => suppliedSnapping ?? new EdgelessSnappingStore(),
    [suppliedSnapping],
  );
  return (
    <EdgelessToolsProvider>
      <SurfaceBoundary type="edgeless">
        <EdgelessSurfaceContent {...configured} {...props} snapping={snapping} />
      </SurfaceBoundary>
    </EdgelessToolsProvider>
  );
}

/** Surface-local snapping and placement configuration. */
interface SurfaceContentProps {
  readonly snapping: EdgelessSnappingStore;
  readonly avoidBlockElementOverlap?: boolean;
  readonly blockElementWidth?: number;
}

/**
 * Composes the generic viewport with document cards and Rivto-specific chrome.
 *
 * Registers the mounted occurrence and observes its viewport lifetime. The root
 * reference connects both the panel and the surface controller; viewport layout
 * and scrolling invalidate the cached client origin without measuring camera translation.
 * Mirrors the surface snapping settings into
 * its independent scene. The current snapshot drives toolbar controls and viewport markers.
 *
 * @param props - Snapping owner and new-card placement defaults.
 * @param props.snapping - Borrowed surface-local snapping preferences and subscriptions.
 * @param props.avoidBlockElementOverlap - Whether newly created cards avoid existing cards; defaults to true.
 * @param props.blockElementWidth - Preferred new-card width in canvas units; defaults to the shared card width.
 * @returns Virtualized edgeless content with local camera and gesture policies.
 * @throws If rendered outside the receiving EditorPanel and its edgeless canvas provider.
 */
function EdgelessSurfaceContent({
  snapping,
  avoidBlockElementOverlap = true,
  blockElementWidth = EDGELESS_CARD_DEFAULT_FRAME.width,
}: SurfaceContentProps) {
  const panel = useReactPanel();
  const canvas = useEdgelessCanvas()!;
  const camera = useCanvasCamera(canvas);
  const snap = useSurfaceSnapping(snapping);
  const controller = useMemo(
    () => new EdgelessSurfaceController(panel, canvas, avoidBlockElementOverlap, blockElementWidth),
    [panel, canvas, avoidBlockElementOverlap, blockElementWidth],
  );
  const spotlight = useMemo(() => new EdgelessGridSpotlight(), []);
  const { reactPanel } = useReactPanelContext();
  const { ref: registerRoot, element: root } = useEditorRoot();
  const rootRef = useCallback(
    (root: HTMLElement | null) => {
      controller.viewport = root;
      spotlight.viewport = root;
      registerRoot(root);
    },
    [controller, spotlight, registerRoot],
  );
  useEffect(() => spotlight.observeViewport(), [spotlight]);
  useEffect(() => controller.applySnapping(snap), [controller, snap]);
  return (
    <BlockEditorScope editor={reactPanel.page} root={root}>
      <CanvasView
        canvas={canvas}
        viewportRef={rootRef}
        interactions={false}
        {...controller.getViewportProps(camera, snap)}
        onPointerMove={spotlight.updatePointerSpotlight}
        onPointerEnter={spotlight.refreshViewportOrigin}
        overlay={
          <EdgelessSurfaceOverlay
            controller={spotlight}
            canvas={canvas}
            snapping={snapping}
            snap={snap}
            zoom={camera.zoom}
          />
        }
      >
        <EdgelessCards canvas={canvas} />
      </CanvasView>
    </BlockEditorScope>
  );
}

/**
 * Observes a surface's borrowed snapping preferences until unmount or store replacement.
 *
 * @param snapping - Read and subscription operations of the surface's settings store.
 * @returns Current stable snapshot, replaced when a preference changes.
 */
function useSurfaceSnapping(snapping: Pick<EdgelessSnappingStore, "subscribe" | "getSnapshot">) {
  return useSyncExternalStore(
    (listener) => snapping.subscribe(listener),
    () => snapping.getSnapshot(),
    () => snapping.getSnapshot(),
  );
}

/** Screen-space viewport UI and the local spotlight owner. */
interface SurfaceOverlayProps extends ZoomControlProps {
  readonly controller: Pick<EdgelessGridSpotlight, "spotlightOverlay">;
}

/**
 * Renders the pointer spotlight and viewport controls outside the transformed world layer.
 *
 * @param props - Camera values, preferences and the controller owning spotlight paint scheduling.
 * @param props.controller - Receives the mounted overlay for animation-frame updates.
 * @returns Screen-coordinate spotlight and zoom/snapping controls.
 */
function EdgelessSurfaceOverlay({ controller, ...controls }: SurfaceOverlayProps) {
  return (
    <>
      <div
        ref={(node) => {
          controller.spotlightOverlay = node;
        }}
        className={GRID_SPOTLIGHT_CLASS}
        aria-hidden="true"
      />
      <EdgelessZoomControls {...controls} />
    </>
  );
}

/** Scene observation used to determine mounted root cards. */
interface EdgelessCardsProps {
  readonly canvas: CanvasApi;
}

/**
 * Renders visible root cards using their boundary IDs in the current root order.
 *
 * Camera-only parent updates do not resolve block ranges again. Visible membership,
 * root order and element subscriptions still update the mounted cards independently.
 *
 * @param props - Scene controlling card visibility.
 * @param props.canvas - Scene whose visible IDs include focused and pinned cards.
 * @returns Mounted block cards; inserted roots between boundaries need no property rewrite.
 */
const EdgelessCards = memo(function EdgelessCards({ canvas }: EdgelessCardsProps) {
  const panel = useReactPanel();
  const visible = useCanvasVisible(canvas);
  const visibleIds = useMemo(() => new Set(visible), [visible]);
  const rootIds = useRootBlockIds();
  const blockElements = useElements().filter(
    (element) =>
      visibleIds.has(element.id) &&
      element.type === EDGELESS_BLOCK_ELEMENT_TYPE &&
      blockElementRoot(element, panel.blocks) === null,
  );
  // Element boundary IDs resolve against current root order; inserted
  // roots between them render without rewriting element props.
  return (
    <>
      {blockElements.map((element) => (
        <EdgelessBlockElement
          key={element.id}
          element={element}
          blockIds={blockIdsOf(element, rootIds)}
        />
      ))}
    </>
  );
});

/**
 * Renders camera scale and snapping controls using the surface's live settings.
 *
 * @param props - Scene, settings owner and current presentation values.
 * @param props.canvas - Camera receiving zoom requests around the viewport center.
 * @param props.snapping - Store receiving grid and alignment toggles.
 * @param props.snap - Current settings snapshot.
 * @param props.zoom - Current world-to-screen scale.
 * @returns Accessible zoom and snapping toolbar.
 */
function EdgelessZoomControls({ canvas, snapping, snap, zoom }: ZoomControlProps) {
  return (
    <div
      className={ZOOM_CONTROLS_CLASS}
      data-edgeless-ui="true"
      role="toolbar"
      aria-label="Canvas zoom"
    >
      <EdgelessToolButton
        label="Zoom out"
        icon="zoom-out"
        onClick={() => canvas.zoomAt(zoom - 0.1)}
      />
      <EdgelessToolButton
        label="Reset zoom"
        className={ZOOM_VALUE_CLASS}
        onClick={() => canvas.zoomAt(1)}
      >
        {Math.round(zoom * 100)}%
      </EdgelessToolButton>
      <EdgelessToolButton
        label="Zoom in"
        icon="zoom-in"
        onClick={() => canvas.zoomAt(zoom + 0.1)}
      />
      <ToolBarDivider />
      <EdgelessToolButton
        label={snap.snapToGrid ? "Disable snap to grid" : "Enable snap to grid"}
        icon="snap"
        pressed={snap.snapToGrid}
        onClick={() => snapping.set({ snapToGrid: !snap.snapToGrid })}
      />
      <EdgelessToolButton
        label={snap.alignObjects ? "Disable object alignment" : "Enable object alignment"}
        icon="align-objects"
        pressed={snap.alignObjects}
        onClick={() => snapping.set({ alignObjects: !snap.alignObjects })}
      />
    </div>
  );
}

/** Live camera and snapping values presented by the viewport toolbar. */
interface ZoomControlProps {
  readonly canvas: CanvasApi;
  readonly snapping: EdgelessSnappingStore;
  readonly snap: ReturnType<EdgelessSnappingStore["getSnapshot"]>;
  readonly zoom: number;
}
