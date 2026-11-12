import { createElement } from "react";
import { createPortal } from "react-dom";
import { ElementCreationPreview } from "../../../../elements/visuals/element-creation-preview";
import type { CreateElementInput } from "../../../../managers/elements/types";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EdgelessCreationTool } from "../../../../managers/edgeless-tools/edgeless-creation-tool";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import { toolPointer } from "./use-tool-gesture";
import type { VisualFrame } from "../../../../elements/visuals/types";
import { showSnapGuides } from "../../../../surfaces/edgeless/snap-guides";
import type { CanvasApi } from "@chulane/rivto-edgeless";

interface PresetDrag {
  pointerId: number;
  tool: EdgelessCreationTool;
  startX: number;
  startY: number;
  moved: boolean;
  ghost: HTMLDivElement | null;
  raf: number;
  frame?: VisualFrame;
  capture: HTMLButtonElement;
}

/** Surface-local state borrowed by toolbar preset placement. */
interface PresetDragOptions {
  readonly tools: EdgelessToolContext;
  readonly root: HTMLElement | null;
  readonly plane: HTMLElement | null;
  readonly zoom: number;
  readonly canvas: Pick<CanvasApi, "toWorld" | "snapping">;
}

/**
 * Pointer-capture place/drag for create-toolbar presets (no HTML5 DnD).
 *
 * Mounts the registered renderer into a detached preview portal after four screen pixels
 * of movement. Subsequent pointer samples move its host through requestAnimationFrame
 * without inserting or updating document elements. Release over the canvas commits once;
 * a click only selects the placement tool. Escape, panel deactivation, Select/Pan and
 * unmount release capture, remove the ghost and cancel placement.
 * @param props - Surface tool context, canvas root for hit testing/snapping, positioned
 * plane for screen conversion, and viewport scale factor (1 is 100%).
 * @param props.tools - Tool session receiving preset placement and cancellation.
 * @param props.root - Receiving viewport, or null before mount.
 * @param props.plane - World layer used to position the detached preview.
 * @param props.zoom - Current viewport scale for the preview.
 * @param props.canvas - Canvas camera and snapping settings read for each input sample.
 * @returns Preview portal to include in the toolbar tree and start/move/end button handlers.
 * Pass false to endPresetDrag on pointer cancellation; commit otherwise defaults to true.
 */
export function usePresetDrag({ tools, root, plane, zoom, canvas }: PresetDragOptions) {
  const presetDrag = useRef<PresetDrag | null>(null);
  const [preview, setPreview] = useState<{
    host: HTMLDivElement;
    input: CreateElementInput;
    frame: VisualFrame;
  } | null>(null);

  /**
   * Removes the detached preview and cancels its pending animation frame.
   *
   * @param active - Gesture whose preview host is owned by this hook.
   * @returns Clears the portal and host without modifying document data.
   */
  const clearPresetGhost = (active: PresetDrag) => {
    if (active.raf) {
      cancelAnimationFrame(active.raf);
    }
    active.ghost?.remove();
    active.ghost = null;
    active.raf = 0;
    setPreview(null);
  };

  /**
   * Positions the detached preview host using the current canvas transform.
   *
   * @param active - Gesture with a prepared frame and optional preview host.
   * @returns Updates host styles when both the host and plane are available.
   */
  const placePresetGhost = (active: PresetDrag) => {
    active.raf = 0;
    if (!active.ghost || !active.frame || !plane) {
      return;
    }
    const rect = plane.getBoundingClientRect();
    active.ghost.style.width = `${active.frame.width}px`;
    active.ghost.style.height = `${active.frame.height}px`;
    active.ghost.style.transform = `translate(${rect.left + active.frame.x * zoom}px, ${rect.top + active.frame.y * zoom}px) scale(${zoom})`;
  };

  /**
   * Prepares a toolbar draft and displays the tool's snapping feedback.
   *
   * @param event - Button pointer event normalized into canvas coordinates.
   * @param active - Gesture whose tool owns prospective creation data.
   * @returns Detached draft supplied by the tool.
   * @throws If the creation tool rejects draft preparation.
   */
  const placement = (event: ReactPointerEvent<HTMLButtonElement>, active: PresetDrag) => {
    const draft = active.tool.preparePlacement(toolPointer(event.nativeEvent, root, zoom, canvas));
    showSnapGuides(plane, draft.guides ?? []);
    return draft;
  };

  /**
   * Discards an active toolbar gesture and releases its captured pointer.
   *
   * @returns Whether a gesture existed; cancellation clears preview and guides.
   */
  const cancel = () => {
    const active = presetDrag.current;
    if (!active) {
      return false;
    }
    presetDrag.current = null;
    clearPresetGhost(active);
    active.tool.cancel();
    if (active.capture.hasPointerCapture(active.pointerId)) {
      active.capture.releasePointerCapture(active.pointerId);
    }
    showSnapGuides(plane, []);
    return true;
  };

  useEffect(() => {
    const stopKeyboard = tools.reactPanel.keyboard.register(
      {
        id: "edgeless.preset-drag-cancel",
        keys: ["Escape"],
        mode: "edgeless",
        priority: 50,
        when: () => Boolean(presetDrag.current),
      },
      cancel,
    );
    const stopDeactivate = tools.reactPanel.subscribeDeactivation(cancel);
    const stopTools = tools.subscribe(() => {
      if (presetDrag.current && tools.active !== presetDrag.current.tool) {
        cancel();
      }
    });
    return () => {
      stopKeyboard();
      stopDeactivate?.();
      stopTools();
      cancel();
    };
  }, [tools, root]);

  return {
    preview:
      preview &&
      createPortal(
        createElement(ElementCreationPreview, {
          input: preview.input,
          frame: preview.frame,
          operations: tools.operations,
          zoom,
          style: { left: 0, top: 0, transform: "none", width: "100%", height: "100%" },
        }),
        preview.host,
      ),
    /**
     * Captures the primary pointer and records the preset drag's starting position.
     *
     * @param event - Native or React event supplying the current input.
     * @param tool - Registered surface instance whose placement contract supplies the draft.
     */
    startPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, tool: EdgelessCreationTool) {
      if (event.button !== 0 || !tool.supportsPlacement) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      presetDrag.current = {
        pointerId: event.pointerId,
        capture: event.currentTarget,
        tool,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        ghost: null,
        raf: 0,
      };
    },
    /**
     * Starts the place tool after the movement threshold and updates its detached preview and snap guides.
     *
     * @param event - Native or React event supplying the current input.
     */
    movePresetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
      const active = presetDrag.current;
      if (!active || active.pointerId !== event.pointerId) {
        return;
      }
      if (
        !active.moved &&
        Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 4
      ) {
        return;
      }
      try {
        if (!active.moved) {
          tools.activate(active.tool.id);
        }
        const draft = placement(event, active);
        active.frame = draft.frame;
        if (!active.moved) {
          active.moved = true;
          const ghost = event.currentTarget.ownerDocument.createElement("div");
          ghost.className = "edgeless-preset-ghost";
          ghost.dataset.edgelessUi = "true";
          ghost.dataset.kind = active.tool.id;
          event.currentTarget.ownerDocument.body.append(ghost);
          active.ghost = ghost;
          setPreview({ host: ghost, input: draft.input, frame: draft.frame });
        }
        if (!active.raf) {
          active.raf = requestAnimationFrame(() => placePresetGhost(active));
        }
      } catch (error) {
        cancel();
        throw error;
      }
    },
    /**
     * Releases the preset drag preview and capture, creating an element only for a committed drop inside the canvas.
     *
     * @param event - Native or React event supplying the current input.
     * @param commit - Whether to commit the gesture; false cancels without creating or updating document entities.
     */
    endPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, commit = true) {
      const active = presetDrag.current;
      if (!active || active.pointerId !== event.pointerId) {
        return;
      }
      clearPresetGhost(active);
      presetDrag.current = null;
      if (active.capture.hasPointerCapture(active.pointerId)) {
        active.capture.releasePointerCapture(active.pointerId);
      }
      showSnapGuides(plane, []);
      if (!commit) {
        active.tool.cancel();
        return;
      }
      try {
        if (active.moved) {
          const hit = event.currentTarget.ownerDocument.elementFromPoint(
            event.clientX,
            event.clientY,
          );
          if (
            root &&
            hit instanceof Node &&
            root.contains(hit) &&
            !(hit instanceof Element && hit.closest("[data-edgeless-ui]"))
          ) {
            active.tool.commitPlacement(placement(event, active));
          }
          tools.activate(active.tool.id);
          return;
        }
        // Click (no drag): enter place mode; do not create at viewport center.
        tools.activate(active.tool.id);
      } finally {
        active.tool.cancel();
        showSnapGuides(plane, []);
      }
    },
  };
}
