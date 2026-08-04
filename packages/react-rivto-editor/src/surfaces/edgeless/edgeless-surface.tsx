import {
  useDOMEvent,
  useEditor,
  useEditorRoot,
  useKeyboardEvent,
  useRootBlockIds,
} from "../../hooks";
import { BUILTIN_KEYMAP, focusBlock, KEYBOARD_BINDING_IDS } from "../../managers";
import { DEFAULT_BLOCK_TYPE } from "@chulane/rivto";
import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { EdgelessToolButton } from "../../extensions/edgeless/edgeless-tool-button";
import { EDGELESS_CARD_DEFAULT_LAYOUT, EdgelessRootBlock } from "./edgeless-block";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const GRID_SIZE = 20;

interface PanGesture {
  readonly x: number;
  readonly y: number;
  readonly panX: number;
  readonly panY: number;
}

const clampZoom = (value: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

/**
 * Projects root block layouts onto an unbounded, zoomable canvas.
 *
 * Viewport gestures are registered through the editor event runtime. This is
 * important when a surface is replaced: its root, document, and window
 * listeners move together instead of leaving global listeners behind.
 */
export function EdgelessSurface() {
  const editor = useEditor();
  const rootIds = useRootBlockIds();
  const { ref: registerRoot } = useEditorRoot();
  const viewport = useRef<HTMLElement | null>(null);
  const spaceHeld = useRef(false);
  const panGesture = useRef<PanGesture | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const rootRef = useCallback((element: HTMLElement | null) => {
    viewport.current = element;
    registerRoot(element);
  }, [registerRoot]);

  const clearSpace = () => {
    spaceHeld.current = false;
    viewport.current?.removeAttribute("data-panning-ready");
  };

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
    const allowed = event.button === 1 || (event.button === 0 && spaceHeld.current);
    if (!root || !allowed) return false;
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
    if (target.closest("[data-edgeless-root], [data-edgeless-object-kind], [data-edgeless-ui], button, input, textarea, select, a") ||
      target.closest(".edgeless-drawing-capture[data-active]")) return;
    const rect = root.getBoundingClientRect();
    const x = (event.clientX - rect.left - pan.x) / zoom;
    const y = (event.clientY - rect.top - pan.y) / zoom;
    const roots = editor.blocks.getBlocks();
    const zIndex = Math.max(0, ...roots.map((block) => block.layout?.zIndex ?? 0)) + 1;
    const id = editor.blocks.insertBlock({
      type: DEFAULT_BLOCK_TYPE,
      content: "",
      layout: { ...EDGELESS_CARD_DEFAULT_LAYOUT, x, y, zIndex },
    }, roots.at(-1)?.id);
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
      aria-label="Edgeless document canvas"
      tabIndex={-1}
      onDoubleClick={createBlockAt}
      style={{
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
      }}
    >
      <div className="edgeless-zoom-controls" data-edgeless-ui="true" role="toolbar" aria-label="Canvas zoom">
        <EdgelessToolButton label="Zoom out" icon="zoom-out" onClick={() => zoomAt(zoom - 0.1)} />
        <EdgelessToolButton label="Reset zoom" className="edgeless-zoom-value" onClick={() => zoomAt(1)}>{Math.round(zoom * 100)}%</EdgelessToolButton>
        <EdgelessToolButton label="Zoom in" icon="zoom-in" onClick={() => zoomAt(zoom + 0.1)} />
      </div>
      <div
        className="edgeless-plane"
        data-edgeless-plane="true"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {rootIds.map((blockId) => (
          <EdgelessRootBlock key={blockId} blockId={blockId} />
        ))}
      </div>
    </main>
  );
}
