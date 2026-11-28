import { CardMeasurements, type CardMeasurementCanvas } from "./card-measurements";
import type { EditorElementNode } from "@chulane/rivto";
import { EdgelessGridSpotlight } from "./edgeless-grid-spotlight";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import { BlockEditorScope } from "@chulane/rivto-page";
import { CanvasView, useCanvasCamera, useCanvasVisible } from "@chulane/rivto-edgeless/react";
import { useEdgelessCanvas } from "./edgeless-tools-context";
import { EdgelessToolsProvider } from "./edgeless-tools-context";
import type { CanvasApi } from "@chulane/rivto-edgeless";
import { EdgelessSurfaceController } from "./edgeless-surface-controller";
import { registerBlockCanvasDrop } from "./block-canvas-drop";
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
import { EdgelessSnappingStore, type EdgelessSnappingSnapshot } from "@chulane/rivto-edgeless";

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
 * @param props.blockElementWidth - Preferred new-card width in canvas units; defaults to the shared card width.
 * @returns Virtualized edgeless content with local camera and gesture policies.
 * @throws If rendered outside the receiving EditorPanel and its edgeless canvas provider.
 */
function EdgelessSurfaceContent({
  snapping,
  blockElementWidth = EDGELESS_CARD_DEFAULT_FRAME.width,
}: SurfaceContentProps) {
  const panel = useReactPanel();
  const canvas = useEdgelessCanvas()!;
  const camera = useCanvasCamera(canvas);
  const snap = useSyncExternalStore(
    (listener) => snapping.subscribe(listener),
    () => snapping.getSnapshot(),
    () => snapping.getSnapshot(),
  );
  const controller = useMemo(
    () => new EdgelessSurfaceController(panel, canvas, blockElementWidth),
    [panel, canvas, blockElementWidth],
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
  useEffect(() => {
    if (!root) {
      return;
    }
    return registerBlockCanvasDrop(root, panel, canvas, blockElementWidth);
  }, [root, panel, canvas, blockElementWidth]);
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
        <EdgelessCards canvas={canvas} viewport={root} />
      </CanvasView>
    </BlockEditorScope>
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
  readonly viewport: HTMLElement | null;
  readonly canvas: CardMeasurementCanvas;
}

/**
 * Renders visible root cards using their boundary IDs in the current root order.
 *
 * Camera-only parent updates do not resolve block ranges again. Visible membership,
 * root order and element subscriptions still update the mounted cards independently.
 *
 * @param props - Scene controlling card visibility.
 * @param props.canvas - Scene whose visible IDs include focused and pinned cards.
 * @param props.viewport - Mounted viewport used to prioritize pending auto-height measurements.
 * @returns Mounted block cards; inserted roots between boundaries need no property rewrite.
 */
const EdgelessCards = memo(function EdgelessCards({ canvas, viewport }: EdgelessCardsProps) {
  const visible = useCanvasVisible(canvas);
  const rootIds = useRootBlockIds();
  const measurements = useMemo(() => new CardMeasurements(canvas), [canvas]);
  useEffect(
    () => (viewport ? measurements.connect(viewport) : undefined),
    [viewport, measurements],
  );
  const cards = useRootCards(rootIds);
  // Element boundary IDs resolve against current root order; inserted
  // roots between boundaries render without rewriting element props.
  const observers = useMemo(
    () =>
      Array.from(
        cards.values(),
        (element) =>
          element.props.autoHeight !== false && (
            <CardMeasurementObserver
              key={element.id}
              element={element}
              roots={rootIds}
              measurements={measurements}
            />
          ),
      ),
    [cards, rootIds, measurements],
  );
  return (
    <>
      {observers}
      {visible.map((id) => {
        const element = cards.get(id);
        if (!element) {
          return null;
        }
        const blockIds = blockIdsOf(element, rootIds);
        return <EdgelessBlockElement key={id} element={element} blockIds={blockIds} />;
      })}
    </>
  );
});

/**
 * Indexes block cards projected at the top of this panel's block hierarchy.
 *
 * @param rootIds - Current root order, which changes when a card boundary moves into or out of scope.
 * @returns Renderable card nodes by identity until the projection or root membership changes.
 */
function useRootCards(rootIds: readonly string[]) {
  const elements = useElements();
  const panel = useReactPanel();
  // Only card ranges whose block parent is the panel's top level are rendered.
  // In an included-root panel, cards for that root's children remain nested and
  // do not substitute for a card whose range contains the root itself.
  return useMemo(
    () =>
      new Map(
        elements
          .filter(
            (element) =>
              element.type === EDGELESS_BLOCK_ELEMENT_TYPE &&
              blockElementRoot(element, panel.blocks) === null,
          )
          .map((element) => [element.id, element]),
      ),
    [elements, panel, rootIds],
  );
}

interface CardMeasurementObserverProps {
  readonly element: EditorElementNode;
  readonly roots: readonly string[];
  readonly measurements: Pick<CardMeasurements, "invalidate" | "remove">;
}

/**
 * Watches the block subtrees owned by an auto-height card even while its DOM is absent.
 *
 * @param props - Card projection and its surface-owned measurement queue.
 * @param props.element - Card whose width and inclusive range determine its layout.
 * @param props.roots - Current ordered roots used to resolve the range.
 * @param props.measurements - Receives coalesced invalidations and releases deleted identities.
 * @returns No DOM. Subscriptions last until the card changes range or leaves the surface.
 */
const CardMeasurementObserver = memo(function CardMeasurementObserver({
  element,
  roots,
  measurements,
}: CardMeasurementObserverProps) {
  const { blocks } = useReactPanel();
  const { id, frame, props } = element;
  useEffect(() => {
    /**
     * Queues the owning card when a root or one of its descendants changes.
     *
     * @returns Records one pending height check for the current card.
     */
    const invalidate = () => measurements.invalidate(id);
    const stops = blockIdsOf(element, roots).map((root) => blocks.subscribeBlock(root, invalidate));
    invalidate();
    return () => {
      stops.forEach((stop) => stop());
      measurements.remove(id);
    };
  }, [
    blocks,
    id,
    roots,
    frame.width,
    frame.x,
    frame.y,
    props.startBlockId,
    props.endBlockId,
    props.borderless,
    props.rotation,
    measurements,
  ]);
  return null;
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
  readonly snap: EdgelessSnappingSnapshot;
  readonly zoom: number;
}
