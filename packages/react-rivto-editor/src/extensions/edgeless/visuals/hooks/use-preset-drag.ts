import { createElement } from "react";
import { createPortal } from "react-dom";
import { ElementCreationPreview } from "../../../../elements/visuals/element-creation-preview";
import type { CreateElementInput } from "../../../../managers/elements/types";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EdgelessOperations } from "../../../../managers/elements/edgeless-operations";
import type { PresetPayload, VisualFrame } from "../../../../elements/visuals/types";
import { canvasPoint } from "../../../../elements/visuals/utils/canvas-point";
import { centeredPlaceFrame, snapPlacedFrame } from "../../../../elements/visuals/utils/creation-geometry";
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
  capture: HTMLButtonElement;
}

/** Pointer-capture place/drag for create-toolbar presets (no HTML5 DnD). */
export function usePresetDrag({
  edgelessOperation,
  root,
  plane,
  zoom,
}: {
  edgelessOperation: EdgelessOperations;
  root: HTMLElement | null;
  plane: HTMLElement | null;
  zoom: number;
}) {
  const presetDrag = useRef<PresetDrag | null>(null);
  const [preview, setPreview] = useState<{ host: HTMLDivElement; input: CreateElementInput; frame: VisualFrame } | null>(null);

  const clearPresetGhost = (active: PresetDrag) => {
    if (active.raf) cancelAnimationFrame(active.raf);
    active.ghost?.remove();
    active.ghost = null;
    active.raf = 0;
    setPreview(null);
  };

  const placePresetGhost = (active: PresetDrag) => {
    active.raf = 0;
    if (!active.ghost || !active.frame || !plane) return;
    const rect = plane.getBoundingClientRect();
    active.ghost.style.width = `${active.frame.width}px`;
    active.ghost.style.height = `${active.frame.height}px`;
    active.ghost.style.transform = `translate(${rect.left + active.frame.x * zoom}px, ${rect.top + active.frame.y * zoom}px) scale(${zoom})`;
  };

  const snappedFrame = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const point = canvasPoint(event.nativeEvent, root, zoom);
    const candidates = edgelessOperation.elements.getElementNodes()
      .filter((element) => element.type !== "connector" && element.type !== "group")
      .map((element) => element.frame);
    return snapPlacedFrame(
      centeredPlaceFrame(point, edgelessOperation.getPlaceSize()),
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

  const cancel = () => {
    const active = presetDrag.current;
    if (!active) return false;
    presetDrag.current = null;
    clearPresetGhost(active);
    if (active.capture.hasPointerCapture(active.pointerId)) active.capture.releasePointerCapture(active.pointerId);
    if (root) showSnapGuides(root, []);
    return true;
  };

  useEffect(() => {
    const stopKeyboard = (edgelessOperation.reactPanel ?? edgelessOperation.runtime).keyboard.register({
      id: 'edgeless.preset-drag-cancel', keys: ['Escape'], mode: 'edgeless', priority: 50,
      when: () => Boolean(presetDrag.current),
    }, cancel);
    const stopDeactivate = edgelessOperation.reactPanel?.subscribeDeactivation(cancel);
    const stopTools = edgelessOperation.subscribe(() => {
      const tool = edgelessOperation.getTool();
      if (tool.tool === 'select' || tool.tool === 'pan') cancel();
    });
    return () => { stopKeyboard(); stopDeactivate?.(); stopTools(); cancel(); };
  }, [edgelessOperation, root]);

  return {
    preview: preview && createPortal(createElement(ElementCreationPreview, {
      input: preview.input, frame: preview.frame, operations: edgelessOperation, zoom,
      style: { left: 0, top: 0, transform: 'none', width: '100%', height: '100%' },
    }), preview.host),
    startPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, payload: PresetPayload) {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      presetDrag.current = {
        pointerId: event.pointerId,
        capture: event.currentTarget,
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
      if (!active.moved) edgelessOperation.setPlaceTool(active.payload);
      const snapped = snappedFrame(event);
      active.frame = snapped.frame;
      if (!active.moved) {
        active.moved = true;
        const ghost = event.currentTarget.ownerDocument.createElement("div");
        ghost.className = "edgeless-preset-ghost";
        ghost.dataset.edgelessUi = "true";
        ghost.dataset.kind = active.payload.kind;
        event.currentTarget.ownerDocument.body.append(ghost);
        active.ghost = ghost;
        const { kind, frame: _frame, ...props } = active.payload;
        void _frame;
        setPreview({ host: ghost, input: { type: kind, props }, frame: snapped.frame });
      }
      if (root) showSnapGuides(root, snapped.guides);
      if (!active.raf) active.raf = requestAnimationFrame(() => placePresetGhost(active));
    },
    endPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, commit = true) {
      const active = presetDrag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      clearPresetGhost(active);
      presetDrag.current = null;
      if (active.capture.hasPointerCapture(active.pointerId)) active.capture.releasePointerCapture(active.pointerId);
      if (root) showSnapGuides(root, []);
      if (!commit) return;
      if (active.moved) {
        const hit = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY);
        if (root && hit instanceof Node && root.contains(hit) && !(hit instanceof Element && hit.closest("[data-edgeless-ui]"))) {
          const frame = snappedFrame(event).frame;
          edgelessOperation.create({ ...active.payload, frame });
        }
        edgelessOperation.setPlaceTool(active.payload);
        return;
      }
      // Click (no drag): enter place mode; do not create at viewport center.
      edgelessOperation.setPlaceTool(active.payload);
    },
  };
}
