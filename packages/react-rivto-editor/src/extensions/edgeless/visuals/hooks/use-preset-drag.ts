import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { EdgelessVisualController } from "../controller";
import type { PresetPayload } from "../types";
import { canvasPoint } from "../utils/canvas-point";

interface PresetDrag {
  pointerId: number;
  payload: PresetPayload;
  startX: number;
  startY: number;
  moved: boolean;
  ghost: HTMLDivElement | null;
  raf: number;
  clientX: number;
  clientY: number;
}

/** Pointer-capture place/drag for create-toolbar presets (no HTML5 DnD). */
export function usePresetDrag({
  controller,
  root,
  plane,
  zoom,
}: {
  controller: EdgelessVisualController;
  root: HTMLElement | null;
  plane: HTMLElement | null;
  zoom: number;
}) {
  const presetDrag = useRef<PresetDrag | null>(null);

  const clearPresetGhost = (active: PresetDrag) => {
    if (active.raf) cancelAnimationFrame(active.raf);
    active.ghost?.remove();
    active.ghost = null;
    active.raf = 0;
  };

  const placePresetGhost = (active: PresetDrag) => {
    active.raf = 0;
    if (!active.ghost) return;
    active.ghost.style.transform = `translate(${active.clientX - 80}px, ${active.clientY - 60}px)`;
  };

  useEffect(() => () => {
    const active = presetDrag.current;
    if (!active) return;
    clearPresetGhost(active);
    presetDrag.current = null;
  }, []);

  return {
    startPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, payload: PresetPayload) {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      presetDrag.current = {
        pointerId: event.pointerId,
        payload,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        ghost: null,
        raf: 0,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    },
    movePresetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
      const active = presetDrag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      active.clientX = event.clientX;
      active.clientY = event.clientY;
      if (!active.moved && Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 4) return;
      if (!active.moved) {
        active.moved = true;
        const ghost = event.currentTarget.ownerDocument.createElement("div");
        ghost.className = "edgeless-preset-ghost";
        ghost.dataset.edgelessUi = "true";
        ghost.dataset.kind = active.payload.kind;
        if (active.payload.kind === "sticker" && active.payload.fill) ghost.style.background = active.payload.fill;
        event.currentTarget.ownerDocument.body.append(ghost);
        active.ghost = ghost;
      }
      if (!active.raf) active.raf = requestAnimationFrame(() => placePresetGhost(active));
    },
    endPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, commit = true) {
      const active = presetDrag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      clearPresetGhost(active);
      presetDrag.current = null;
      if (!commit) return;
      if (active.moved) {
        const hit = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY);
        if (root && hit instanceof Node && root.contains(hit) && !(hit instanceof Element && hit.closest("[data-edgeless-ui]"))) {
          const point = canvasPoint(event.nativeEvent, plane, zoom);
          controller.create({ ...active.payload, frame: { x: point.x - 80, y: point.y - 60, width: 160, height: 120 } });
        }
        controller.setPlaceTool(active.payload);
        return;
      }
      // Click (no drag): enter place mode; do not create at viewport center.
      controller.setPlaceTool(active.payload);
    },
  };
}
