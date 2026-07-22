import { useDocument, useEditorRoot } from "@chulane/rivto";
import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { EdgelessRootBlock } from "./EdgelessBlock";

export const EDGELESS_PLANE_WIDTH = 2400;
export const EDGELESS_PLANE_HEIGHT = 1600;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

const clampZoom = (value: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

/**
 * Projects root block layouts onto a scrollable, zoomable demo canvas.
 *
 * Browser scrolling supplies the viewport model. The scaled wrapper gives the
 * browser the correct scroll extent while the inner plane keeps persisted
 * block coordinates unscaled. Space+drag and middle-button drag merely adjust
 * scroll offsets, so no viewport data enters the collaborative document.
 */
export function EdgelessSurface() {
  const document = useDocument();
  const { ref: registerRoot } = useEditorRoot();
  const viewport = useRef<HTMLElement | null>(null);
  const spaceHeld = useRef(false);
  const cancelPan = useRef<() => void>(() => undefined);
  const [zoom, setZoom] = useState(1);

  const rootRef = useCallback((element: HTMLElement | null) => {
    viewport.current = element;
    registerRoot(element);
  }, [registerRoot]);

  useEffect(() => {
    const clearSpace = () => {
      spaceHeld.current = false;
      viewport.current?.removeAttribute("data-panning-ready");
    };
    const releaseSpace = (event: KeyboardEvent) => {
      if (event.code === "Space") clearSpace();
    };
    window.addEventListener("keyup", releaseSpace);
    window.addEventListener("blur", clearSpace);
    return () => {
      cancelPan.current();
      window.removeEventListener("keyup", releaseSpace);
      window.removeEventListener("blur", clearSpace);
    };
  }, []);

  const pan = (event: PointerEvent<HTMLElement>): void => {
    const root = viewport.current;
    const allowed = event.button === 1 || (event.button === 0 && spaceHeld.current);
    if (!root || !allowed) return;
    cancelPan.current();
    event.preventDefault();
    const start = {
      x: event.clientX,
      y: event.clientY,
      left: root.scrollLeft,
      top: root.scrollTop,
    };
    root.dataset.panning = "true";
    const move = (next: globalThis.PointerEvent) => {
      root.scrollLeft = start.left - (next.clientX - start.x);
      root.scrollTop = start.top - (next.clientY - start.y);
    };
    const stop = () => {
      delete root.dataset.panning;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      cancelPan.current = () => undefined;
    };
    cancelPan.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

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

  const wheel = (event: WheelEvent<HTMLElement>): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomAt(zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
  };

  return (
    <main
      ref={rootRef}
      className="edgeless-viewport"
      data-edgeless-zoom={zoom}
      aria-label="Edgeless document canvas"
      tabIndex={-1}
      onPointerDownCapture={pan}
      onWheel={wheel}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (event.code !== "Space" || target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
        event.preventDefault();
        spaceHeld.current = true;
        event.currentTarget.dataset.panningReady = "true";
      }}
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
