import {
  useDocument,
  useDOMEvent,
  useEditorRoot,
  useKeyboardEvent,
} from "../../hooks";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../managers";
import { useCallback, useRef, useState } from "react";
import { EdgelessRootBlock } from "./EdgelessBlock";

export const EDGELESS_PLANE_WIDTH = 2400;
export const EDGELESS_PLANE_HEIGHT = 1600;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

interface PanGesture {
  readonly x: number;
  readonly y: number;
  readonly left: number;
  readonly top: number;
}

const clampZoom = (value: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

/**
 * Projects root block layouts onto a scrollable, zoomable demo canvas.
 *
 * Viewport gestures are registered through the editor event runtime. This is
 * important when a surface is replaced: its root, document, and window
 * listeners move together instead of leaving global listeners behind.
 */
export function EdgelessSurface() {
  const document = useDocument();
  const { ref: registerRoot } = useEditorRoot();
  const viewport = useRef<HTMLElement | null>(null);
  const spaceHeld = useRef(false);
  const panGesture = useRef<PanGesture | null>(null);
  const [zoom, setZoom] = useState(1);

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
      left: root.scrollLeft,
      top: root.scrollTop,
    };
    root.dataset.panning = "true";
    return true;
  });

  useDOMEvent({
    id: "edgeless.pan.pointer-move",
    type: "pointermove",
    target: "window",
    passive: false,
  }, ({ raw: event }) => {
    const root = viewport.current;
    const start = panGesture.current;
    if (!root || !start) return false;
    root.scrollLeft = start.left - (event.clientX - start.x);
    root.scrollTop = start.top - (event.clientY - start.y);
    return true;
  });

  const stopPan = () => {
    if (!panGesture.current) return false;
    panGesture.current = null;
    viewport.current?.removeAttribute("data-panning");
    return false;
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

  const zoomAt = (nextZoom: number, clientX?: number, clientY?: number): void => {
    const root = viewport.current;
    const next = clampZoom(nextZoom);
    if (!root || next === zoom) return setZoom(next);
    const rect = root.getBoundingClientRect();
    const x = (clientX ?? rect.left + root.clientWidth / 2) - rect.left;
    const y = (clientY ?? rect.top + root.clientHeight / 2) - rect.top;
    const canvasX = (root.scrollLeft + x) / zoom;
    const canvasY = (root.scrollTop + y) / zoom;
    setZoom(next);
    requestAnimationFrame(() => {
      root.scrollLeft = canvasX * next - x;
      root.scrollTop = canvasY * next - y;
    });
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
      aria-label="Edgeless document canvas"
      tabIndex={-1}
    >
      <div className="edgeless-zoom-controls" role="toolbar" aria-label="Canvas zoom">
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(zoom - 0.1)}>−</button>
        <button type="button" aria-label="Reset zoom" onClick={() => zoomAt(1)}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(zoom + 0.1)}>+</button>
      </div>
      <div
        className="edgeless-scaled-plane"
        style={{ width: EDGELESS_PLANE_WIDTH * zoom, height: EDGELESS_PLANE_HEIGHT * zoom }}
      >
        <div
          className="edgeless-plane"
          data-edgeless-plane="true"
          style={{
            width: EDGELESS_PLANE_WIDTH,
            height: EDGELESS_PLANE_HEIGHT,
            transform: `scale(${zoom})`,
          }}
        >
          {document.document.map((block) => (
            <EdgelessRootBlock key={block.id} blockId={block.id} />
          ))}
        </div>
      </div>
    </main>
  );
}
