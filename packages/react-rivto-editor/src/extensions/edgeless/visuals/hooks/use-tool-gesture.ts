import { useCanvasToolGesture } from "@chulane/rivto-edgeless/react";
import { useCallback } from "react";
import type {
  EdgelessTool,
  EdgelessToolPointer,
} from "../../../../managers/edgeless-tools/edgeless-tool";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import { canvasPoint } from "../../../../elements/visuals/utils/canvas-point";
import type { CanvasApi } from "@chulane/rivto-edgeless";

/** Surface-local inputs required to route an active tool gesture. */
interface UseToolGestureOptions {
  readonly tools: EdgelessToolContext;
  readonly tool?: EdgelessTool;
  readonly root: HTMLElement | null;
  readonly zoom: number;
  readonly canvas: Pick<CanvasApi, "toWorld" | "snapping">;
}

/**
 * Converts browser pointer input into the tool's canvas-space contract.
 *
 * @param event - Native viewport coordinates and pointer/modifier metadata.
 * @param root - Receiving canvas root used to calculate client coordinates.
 * @param zoom - Canvas scale used for screen-constant snapping distance.
 * @param canvas - Surface-owned camera and live snapping preferences.
 * @returns Detached normalized input without a DOM event or target reference.
 */
export function toolPointer(
  event: Pick<PointerEvent, "clientX" | "clientY" | "pointerId" | "button" | "shiftKey" | "altKey">,
  root: HTMLElement | null,
  zoom: number,
  canvas: Pick<CanvasApi, "toWorld" | "snapping">,
): EdgelessToolPointer {
  const snapping = canvas.snapping.get();
  return {
    point: canvasPoint(event, root, canvas),
    pointerId: event.pointerId,
    button: event.button,
    shiftKey: event.shiftKey,
    zoom,
    snapping: {
      snapToGrid: snapping.snap,
      alignObjects: snapping.align,
      grid: snapping.grid || undefined,
      threshold: 8 / Math.max(zoom, 0.01),
      disabled: event.altKey,
    },
  };
}

/**
 * Binds the canvas pointer adapter to Rivto keyboard routing and panel deactivation.
 *
 * Tool implementations own geometry and preview state. This adapter only normalizes
 * input and supplies Escape/deactivation policies; it never inspects tool IDs.
 *
 * @param props - Surface context, active instance, root, viewport scale and canvas scene.
 * @param props.tools - Tool session receiving cancellation and panel deactivation.
 * @param props.tool - Active tool, if one is selected.
 * @param props.root - Receiving viewport, or null before mount.
 * @param props.zoom - Current viewport scale used for screen-constant snapping.
 * @param props.canvas - Canvas camera and snapping settings read for each input sample.
 * @returns Pointer handlers for the common capture layer.
 */
export function useToolGesture({ tools, tool, root, zoom, canvas }: UseToolGestureOptions) {
  const subscribeCancellation = useCallback(
    (cancel: () => boolean, isCaptured: () => boolean) => {
      const stopKeyboard = tools.reactPanel.keyboard.register(
        {
          id: "edgeless.gesture-cancel",
          keys: ["Escape"],
          mode: "edgeless",
          priority: 40,
          when: isCaptured,
        },
        cancel,
      );
      const stopDeactivate = tools.reactPanel.subscribeDeactivation(cancel);
      return () => {
        stopKeyboard();
        stopDeactivate();
      };
    },
    [tools],
  );
  return useCanvasToolGesture({
    tool,
    normalize: (event) => toolPointer(event, root, zoom, canvas),
    subscribeCancellation,
  });
}
