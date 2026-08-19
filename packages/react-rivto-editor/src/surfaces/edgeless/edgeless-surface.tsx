/**
 * React surface for the zoomable edgeless canvas.
 *
 * Owns viewport-local presentation state, browser gestures, and projection of
 * canonical block elements onto the canvas. Persisted document mutations stay
 * in core managers while transient pan, zoom, and pointer visuals remain here.
 */
import {
  useDOMEvent,
  useEditor,
  useEditorRoot,
  useKeyboardEvent,
  useReactEditor,
} from "../../hooks";
import { BUILTIN_KEYMAP, focusBlock, KEYBOARD_BINDING_IDS } from "../../managers";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { EdgelessToolButton } from "../../extensions/edgeless/visuals/components/tool-button";
import { EDGELESS_GRID_SIZE } from "../../extensions/edgeless/visuals/utils/geometry";
import { EdgelessBlockElement } from "./edgeless-block";
import {
  blockIdsOf,
  EDGELESS_BLOCK_ELEMENT_TYPE,
  EDGELESS_CARD_DEFAULT_FRAME,
  insertBlockElementSeparator,
  nonOverlappingBlockFrame,
} from "./block-elements";
import { EdgelessSnappingStore } from "./snapping-store";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
/** Strongest background-dot fade at minimum zoom; keeps a faint residual grid. */
const MAX_GRID_DOT_FADE = 0.7;
const GRID_SPOTLIGHT_CLASS = "edgeless-grid-spotlight";

interface PanGesture {
  readonly x: number;
  readonly y: number;
  readonly panX: number;
  readonly panY: number;
}

const clampZoom = (value: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

/**
 * Mix amount toward transparent background grid dots at the current zoom.
 *
 * 100% zoom keeps the designed pale dots. As scale drops toward the minimum,
 * packed cells fade, but a residual mix remains so the field never vanishes.
 *
 * @param zoom - Viewport scale already clamped to `[MIN_ZOOM, MAX_ZOOM]`.
 * @returns A CSS percentage for `--rivto-edgeless-grid-dot-fade`.
 */
function gridDotFade(zoom: number): string {
  const amount = Math.max(0, Math.min(1, (1 - zoom) / (1 - MIN_ZOOM))) * MAX_GRID_DOT_FADE;
  return `${Math.round(amount * 100)}%`;
}

/**
 * Projects root block layouts onto an unbounded, zoomable canvas.
 *
 * Viewport gestures are registered through the editor event runtime. This is
 * important when a surface is replaced: its root, document, and window
 * listeners move together instead of leaving global listeners behind.
 */
export function EdgelessSurface({
  snapping,
  avoidBlockElementOverlap = true,
  blockElementWidth = EDGELESS_CARD_DEFAULT_FRAME.width,
}: {
  readonly snapping: EdgelessSnappingStore;
  readonly avoidBlockElementOverlap?: boolean;
  readonly blockElementWidth?: number;
}) {
  const editor = useEditor();
  const reactEditor = useReactEditor();
  const rootIds = editor.blocks.getRootIds();
  const blockElements = editor.elements.getElements().filter((element) => element.type === EDGELESS_BLOCK_ELEMENT_TYPE);
  const { ref: registerRoot } = useEditorRoot();
  const viewport = useRef<HTMLElement | null>(null);
  const spotlightOverlay = useRef<HTMLDivElement | null>(null);
  const spotlightFrame = useRef<number | null>(null);
  const spotlightPoint = useRef({ x: 0, y: 0 });
  const viewportOrigin = useRef({ left: 0, top: 0 });
  const spaceHeld = useRef(false);
  const panGesture = useRef<PanGesture | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const snap = useSyncExternalStore(
    (listener) => snapping.subscribe(listener),
    () => snapping.getSnapshot(),
    () => snapping.getSnapshot(),
  );

  const rootRef = useCallback((element: HTMLElement | null) => {
    viewport.current = element;
    registerRoot(element);
  }, [registerRoot]);

  const clearSpace = () => {
    spaceHeld.current = false;
    viewport.current?.removeAttribute("data-panning-ready");
  };

  const panReady = () => spaceHeld.current || viewport.current?.dataset.edgelessTool === "pan";

  /**
   * Caches the viewport's client origin so pointermove can avoid layout reads.
   *
   * @returns Nothing.
   */
  const refreshViewportOrigin = (): void => {
    const root = viewport.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    viewportOrigin.current = { left: bounds.left, top: bounds.top };
  };

  /**
   * Moves the CSS-rendered grid spotlight without causing a React render.
   *
   * Writes `--rivto-edgeless-pointer-x/y` only on the empty overlay so inherited
   * custom properties do not restyle the canvas tree. Skipped during transform
   * and pan so those gestures do not also invalidate spotlight styles.
   *
   * @param event - Pointer movement bubbling through the edgeless viewport.
   * @returns Nothing.
   */
  const updatePointerSpotlight = (event: ReactPointerEvent<HTMLElement>): void => {
    spotlightPoint.current = {
      x: event.clientX,
      y: event.clientY,
    };
    if (spotlightFrame.current !== null) return;
    spotlightFrame.current = requestAnimationFrame(() => {
      const root = viewport.current;
      const overlay = spotlightOverlay.current;
      spotlightFrame.current = null;
      if (!root || !overlay) return;
      if (root.dataset.transforming || root.dataset.panning === "true") return;
      overlay.style.setProperty("--rivto-edgeless-pointer-x", `${spotlightPoint.current.x - viewportOrigin.current.left}px`);
      overlay.style.setProperty("--rivto-edgeless-pointer-y", `${spotlightPoint.current.y - viewportOrigin.current.top}px`);
    });
  };

  /**
   * Cancels a pending pointer-spotlight animation frame.
   *
   * @returns Nothing.
   */
  const cancelPointerSpotlight = (): void => {
    if (spotlightFrame.current === null) return;
    cancelAnimationFrame(spotlightFrame.current);
    spotlightFrame.current = null;
  };

  useEffect(() => () => cancelPointerSpotlight(), []);

  useEffect(() => {
    const root = viewport.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    refreshViewportOrigin();
    const observer = new ResizeObserver(() => refreshViewportOrigin());
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    refreshViewportOrigin();
  }, [pan, zoom]);

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.edgelessPanStart,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessPanStart],
    mode: "edgeless",
    when: ({ raw: event }) => {
      const target = event.target;
      return target instanceof HTMLElement &&
        !target.isContentEditable &&
        !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName);
    },
  }, () => {
    spaceHeld.current = true;
    viewport.current?.setAttribute("data-panning-ready", "true");
    return true;
  });

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.edgelessPanStop,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessPanStop],
    phase: "keyup",
    target: "window",
    mode: "edgeless",
  }, () => {
    clearSpace();
    return false;
  });

  useDOMEvent({
    id: "edgeless.pan.blur",
    type: "blur",
    target: "window",
  }, () => {
    clearSpace();
    panGesture.current = null;
    viewport.current?.removeAttribute("data-panning");
  });

  useDOMEvent({
    id: "edgeless.pan.pointer-start",
    type: "pointerdown",
    capture: true,
  }, ({ raw: event }) => {
    const root = viewport.current;
    const allowed = event.button === 1 || (event.button === 0 && panReady());
    if (!root || !allowed) return false;
    // Pan tool: ignore chrome controls so zoom/snap toggles still work.
    if (event.button === 0 && root.dataset.edgelessTool === "pan" && event.target instanceof Element && event.target.closest("[data-edgeless-ui]")) {
      return false;
    }
    panGesture.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    root.dataset.panning = "true";
    return true;
  });

  /** Appends and focuses one default root card at an empty canvas point. */
  const createBlockAt = (event: ReactMouseEvent<HTMLElement>): void => {
    const root = viewport.current;
    const target = event.target;
    if (!root || !(target instanceof Element) || event.button !== 0) return;
    if (root.dataset.edgelessTool === "pan" || root.dataset.edgelessTool === "place") return;
    if (target.closest("[data-edgeless-root], [data-edgeless-object-kind], [data-edgeless-ui], button, input, textarea, select, a") ||
      target.closest(".edgeless-drawing-capture[data-active]")) return;
    const rect = root.getBoundingClientRect();
    const x = (event.clientX - rect.left - pan.x) / zoom;
    const y = (event.clientY - rect.top - pan.y) / zoom;
    const preferredFrame = {
      ...EDGELESS_CARD_DEFAULT_FRAME,
      width: Number.isFinite(blockElementWidth) && blockElementWidth > 0 ? blockElementWidth : EDGELESS_CARD_DEFAULT_FRAME.width,
      x,
      y,
    };
    const frame = avoidBlockElementOverlap
      ? nonOverlappingBlockFrame(preferredFrame, editor.elements.getElements().filter((element) => element.type === EDGELESS_BLOCK_ELEMENT_TYPE).map((element) => element.frame))
      : preferredFrame;
    const roots = editor.blocks.getBlocks();
    const zIndex = Math.max(0, ...editor.elements.getElements().map((element) => element.zIndex)) + 1;
    let id = "";
    editor.batchUpdates(() => {
      let afterId = roots.at(-1)?.id;
      const last = roots.at(-1);
      if (last && !reactEditor.blocks.separatesBlockElements(last.type)) {
        afterId = insertBlockElementSeparator(reactEditor, last.id);
      }
      id = reactEditor.blocks.insertBlock(reactEditor.createDefaultBlock(), afterId);
      editor.elements.insertElement({
        type: EDGELESS_BLOCK_ELEMENT_TYPE,
        frame,
        zIndex,
        props: { startBlockId: id, endBlockId: id },
      });
    });
    editor.selection.set([{
      type: "text",
      anchor: { blockId: id, offset: 0 },
      head: { blockId: id, offset: 0 },
    }]);
    requestAnimationFrame(() => focusBlock(root, id, 0));
  };

  useDOMEvent({
    id: "edgeless.pan.pointer-move",
    type: "pointermove",
    target: "window",
    passive: false,
  }, ({ raw: event }) => {
    const root = viewport.current;
    const start = panGesture.current;
    if (!root || !start) return false;
    setPan({
      x: start.panX + event.clientX - start.x,
      y: start.panY + event.clientY - start.y,
    });
    return true;
  });

  const stopPan = () => {
    if (!panGesture.current) return false;
    panGesture.current = null;
    viewport.current?.removeAttribute("data-panning");
    return true;
  };
  useDOMEvent({
    id: "edgeless.pan.pointer-end",
    type: "pointerup",
    target: "window",
  }, stopPan);
  useDOMEvent({
    id: "edgeless.pan.pointer-cancel",
    type: "pointercancel",
    target: "window",
  }, stopPan);

  useDOMEvent({
    id: "edgeless.pan.middle-auxclick",
    type: "auxclick",
    mode: "edgeless",
  }, ({ raw: event }) => event.button === 1);

  const zoomAt = (nextZoom: number, clientX?: number, clientY?: number): void => {
    const root = viewport.current;
    const next = clampZoom(nextZoom);
    if (!root || next === zoom) return setZoom(next);
    const rect = root.getBoundingClientRect();
    const x = (clientX ?? rect.left + root.clientWidth / 2) - rect.left;
    const y = (clientY ?? rect.top + root.clientHeight / 2) - rect.top;
    const canvasX = (x - pan.x) / zoom;
    const canvasY = (y - pan.y) / zoom;
    setZoom(next);
    setPan({ x: x - canvasX * next, y: y - canvasY * next });
  };

  useDOMEvent({
    id: "edgeless.zoom.wheel",
    type: "wheel",
    passive: false,
  }, ({ raw: event }) => {
    // Wheel modifier policy is a pointer gesture rather than a key binding.
    if (!event.ctrlKey && !event.metaKey) return false;
    zoomAt(zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
    return true;
  });

  return (
    <main
      ref={rootRef}
      className="edgeless-viewport"
      data-edgeless-zoom={zoom}
      data-edgeless-pan-x={pan.x}
      data-edgeless-pan-y={pan.y}
      data-edgeless-grid={EDGELESS_GRID_SIZE}
      data-edgeless-snap={snap.snapToGrid ? "true" : "false"}
      data-edgeless-align={snap.alignObjects ? "true" : "false"}
      aria-label="Edgeless document canvas"
      tabIndex={-1}
      onDoubleClick={createBlockAt}
      onPointerMove={updatePointerSpotlight}
      onPointerEnter={refreshViewportOrigin}
      style={{
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        backgroundSize: `${EDGELESS_GRID_SIZE * zoom}px ${EDGELESS_GRID_SIZE * zoom}px`,
        "--rivto-edgeless-zoom": String(zoom),
        "--rivto-edgeless-grid-dot-fade": gridDotFade(zoom),
      } as CSSProperties}
    >
      <div ref={spotlightOverlay} className={GRID_SPOTLIGHT_CLASS} aria-hidden="true" />
      <div className="edgeless-zoom-controls" data-edgeless-ui="true" role="toolbar" aria-label="Canvas zoom">
        <EdgelessToolButton label="Zoom out" icon="zoom-out" onClick={() => zoomAt(zoom - 0.1)} />
        <EdgelessToolButton label="Reset zoom" className="edgeless-zoom-value" onClick={() => zoomAt(1)}>{Math.round(zoom * 100)}%</EdgelessToolButton>
        <EdgelessToolButton label="Zoom in" icon="zoom-in" onClick={() => zoomAt(zoom + 0.1)} />
        <span className="edgeless-tool-bar-divider" aria-hidden="true" />
        <EdgelessToolButton
          label={snap.snapToGrid ? "Disable snap to grid" : "Enable snap to grid"}
          icon="snap"
          aria-pressed={snap.snapToGrid}
          onClick={() => snapping.set({ snapToGrid: !snap.snapToGrid })}
        />
        <EdgelessToolButton
          label={snap.alignObjects ? "Disable object alignment" : "Enable object alignment"}
          icon="align-objects"
          aria-pressed={snap.alignObjects}
          onClick={() => snapping.set({ alignObjects: !snap.alignObjects })}
        />
      </div>
      <div
        className="edgeless-plane"
        data-edgeless-plane="true"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          // Move and size the capture box against the plane transform so it
          // continues covering the viewport after any pan or zoom. The offset
          // variables below restore absolute canvas coordinates inside that box.
          "--edgeless-capture-left": `${-pan.x / zoom}px`,
          "--edgeless-capture-top": `${-pan.y / zoom}px`,
          "--edgeless-capture-width": `${100 / zoom}%`,
          "--edgeless-capture-height": `${100 / zoom}%`,
          "--edgeless-capture-offset-x": `${pan.x / zoom}px`,
          "--edgeless-capture-offset-y": `${pan.y / zoom}px`,
        } as CSSProperties}
      >
        {/* Element boundary IDs resolve against current root order; inserted
            roots between them render without rewriting element props. */}
        {blockElements.map((element) => <EdgelessBlockElement
          key={element.id}
          element={element}
          blockIds={blockIdsOf(element, rootIds)}
        />)}
      </div>
    </main>
  );
}
