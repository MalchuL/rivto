import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { EdgelessVisualController } from "../controller";
import type { PresetPayload, VisualFrame } from "../types";
import { canvasPoint } from "../utils/canvas-point";
import { centeredPlaceFrame, snapPlacedFrame } from "../utils/creation-geometry";
import { showSnapGuides } from "../utils/snap-guides";

interface PresetDrag {
  pointerId: number;
  payload: PresetPayload;
  startX: number;
  startY: number;
  moved: boolean;
  ghost: HTMLDivElement | null;
  raf: number;
  frame?: VisualFrame;
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
    if (!active.ghost || !active.frame || !plane) return;
    const rect = plane.getBoundingClientRect();
    active.ghost.style.width = `${active.frame.width * zoom}px`;
    active.ghost.style.height = `${active.frame.height * zoom}px`;
    active.ghost.style.transform = `translate(${rect.left + active.frame.x * zoom}px, ${rect.top + active.frame.y * zoom}px)`;
  };

  const snappedFrame = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const point = canvasPoint(event.nativeEvent, plane, zoom);
    const candidates = controller.reactEditor.editor.elements.getElements()
      .filter((element) => element.type !== "connector" && element.type !== "group")
      .map((element) => element.frame);
    return snapPlacedFrame(
      centeredPlaceFrame(point, controller.getPlaceSize()),
      candidates,
      {
        snapToGrid: root?.dataset.edgelessSnap !== "false",
        alignObjects: root?.dataset.edgelessAlign !== "false",
        grid: Number(root?.dataset.edgelessGrid) || undefined,
        threshold: 8 / Math.max(zoom, 0.01),
        disabled: event.altKey,
      },
    );
  };

  useEffect(() => () => {
    const active = presetDrag.current;
    if (!active) return;
    clearPresetGhost(active);
    if (root) showSnapGuides(root, []);
    presetDrag.current = null;
  }, [root]);

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
      };
    },
    movePresetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
      const active = presetDrag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      if (!active.moved && Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 4) return;
      if (!active.moved) {
        active.moved = true;
        controller.setPlaceTool(active.payload);
        const ghost = event.currentTarget.ownerDocument.createElement("div");
        ghost.className = "edgeless-preset-ghost";
        ghost.dataset.edgelessUi = "true";
        ghost.dataset.kind = active.payload.kind;
        if (active.payload.kind === "sticker" && active.payload.fill) ghost.style.background = active.payload.fill;
        event.currentTarget.ownerDocument.body.append(ghost);
        active.ghost = ghost;
      }
      const snapped = snappedFrame(event);
      active.frame = snapped.frame;
      if (root) showSnapGuides(root, snapped.guides);
      if (!active.raf) active.raf = requestAnimationFrame(() => placePresetGhost(active));
    },
    endPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, commit = true) {
      const active = presetDrag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      clearPresetGhost(active);
      presetDrag.current = null;
      if (root) showSnapGuides(root, []);
      if (!commit) return;
      if (active.moved) {
        const hit = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY);
        if (root && hit instanceof Node && root.contains(hit) && !(hit instanceof Element && hit.closest("[data-edgeless-ui]"))) {
          const frame = snappedFrame(event).frame;
          controller.create({ ...active.payload, frame });
        }
        controller.setPlaceTool(active.payload);
        return;
      }
      // Click (no drag): enter place mode; do not create at viewport center.
      controller.setPlaceTool(active.payload);
    },
  };
}
