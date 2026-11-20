import { useCanvasToolGesture } from "@chulane/rivto-edgeless/react";
import { useCallback, useRef } from "react";
import { subscribeToolGestureCancellation } from "./tool-gesture-cancellation";
import type { CanvasViewportCoordinates } from "@chulane/rivto-edgeless/react";
import type { ToolGestureOptions } from "./types";
import { toolPointer } from "./tool-pointer";

/**
 * Binds the canvas pointer adapter to Rivto keyboard routing and panel deactivation.
 *
 * Tool implementations own geometry and preview state. This adapter only normalizes
 * input and supplies Escape/deactivation policies; it never inspects tool IDs.
 *
 * @param props - Surface context, active instance, viewport and scale.
 * @param props.tools - Panel cancellation capabilities borrowed from the surface.
 * @param props.tool - Active tool receiving normalized input.
 * @param props.viewport - Live snapping policy.
 * @param props.coordinates - Coordinate capability bound to the current attachment.
 * @param props.zoom - Viewport scale for screen-constant snapping distance.
 * @returns The tool receives input from its capture layer until the subscription is released.
 */
export function useToolGesture({ tools, tool, viewport, coordinates, zoom }: ToolGestureOptions) {
  const activeCoordinates = useRef<Pick<CanvasViewportCoordinates, "clientToWorld"> | null>(null);
  const subscribeCancellation = useCallback(
    (cancel: () => boolean, isCaptured: () => boolean) => {
      const release = subscribeToolGestureCancellation(tools, cancel, isCaptured);
      activeCoordinates.current = coordinates;
      return () => {
        if (activeCoordinates.current === coordinates) {
          activeCoordinates.current = null;
        }
        release();
      };
    },
    [tools, coordinates],
  );
  useCanvasToolGesture({
    tool,
    events: viewport?.events ?? null,
    captureSelector: "[data-edgeless-tool-capture]",
    normalize: (event) => {
      if (!coordinates || activeCoordinates.current !== coordinates) {
        return undefined;
      }
      return toolPointer(event, viewport, coordinates, zoom);
    },
    subscribeCancellation,
  });
}
