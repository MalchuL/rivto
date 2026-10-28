import { useCanvasToolGesture } from "@chulane/rivto-edgeless/react";
import { useCallback } from "react";
import type {
  EdgelessTool,
  EdgelessToolPointer,
} from "../../../../managers/edgeless-tools/edgeless-tool";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import { canvasPoint } from "../../../../elements/visuals/utils/canvas-point";

/**
 * Converts browser pointer input into the tool's canvas-space contract.
 *
 * @param event - Native viewport coordinates and pointer/modifier metadata.
 * @param root - Receiving canvas root, including its snapping preferences.
 * @param zoom - Canvas scale used for screen-constant snapping distance.
 * @returns Detached normalized input without a DOM event or target reference.
 */
export function toolPointer(
  event: Pick<PointerEvent, "clientX" | "clientY" | "pointerId" | "button" | "shiftKey" | "altKey">,
  root: HTMLElement | null,
  zoom: number,
): EdgelessToolPointer {
  return {
    point: canvasPoint(event, root, zoom),
    pointerId: event.pointerId,
    button: event.button,
    shiftKey: event.shiftKey,
    zoom,
    snapping: {
      snapToGrid: root?.dataset.edgelessSnap !== "false",
      alignObjects: root?.dataset.edgelessAlign !== "false",
      grid: Number(root?.dataset.edgelessGrid) || undefined,
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
 * @param props - Surface context, active instance, root and viewport scale.
 * @returns Pointer handlers for the common capture layer.
 */
export function useToolGesture({
  tools,
  tool,
  root,
  zoom,
}: {
  readonly tools: EdgelessToolContext;
  readonly tool?: EdgelessTool;
  readonly root: HTMLElement | null;
  readonly zoom: number;
}) {
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
    normalize: (event) => toolPointer(event, root, zoom),
    subscribeCancellation,
  });
}
