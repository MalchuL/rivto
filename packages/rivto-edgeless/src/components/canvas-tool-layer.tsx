import { ReactCanvasTool } from "../tools/react-canvas-tool";
import { useCallback, useSyncExternalStore } from "react";
import type { Canvas } from "../core/canvas";
import type { CanvasTool } from "../core/tools/canvas-tool";
import type { CanvasToolSession } from "../types/tool-session";
import { useCanvasToolGesture } from "../hooks/use-canvas-tool-gesture";

/** Preview subscriptions and zoom supplied to a registered React tool. */
export interface CanvasToolPreviewProps {
  readonly tool: CanvasTool;
  readonly zoom: number;
}

/** World conversion and tool state borrowed by the transparent capture layer. */
interface CanvasToolLayerProps {
  readonly canvas: Pick<Canvas, "camera" | "snapping" | "toWorld">;
  readonly root: HTMLElement;
  readonly tool: CanvasTool;
  readonly tools: Pick<CanvasToolSession, "reset">;
}

/**
 * Renders the active instance's local preview without rerendering the whole toolbar.
 *
 * @param props - Tool instance and the current camera zoom.
 * @returns Transient content rendered in world coordinates.
 */
export function CanvasToolPreview({ tool, zoom }: CanvasToolPreviewProps) {
  useSyncExternalStore(
    (listener) => tool.subscribe(listener),
    () => tool.revision,
    () => tool.revision,
  );
  return tool instanceof ReactCanvasTool ? tool.renderPreview(zoom) : null;
}

/**
 * Routes viewport pointer input to an active tool through the shared gesture adapter.
 *
 * @param props - Canvas coordinates, receiving viewport and tool session.
 * @returns A transparent capture surface; the tool alone decides whether to accept a gesture.
 */
export function CanvasToolLayer({ canvas, root, tool, tools }: CanvasToolLayerProps) {
  const subscribeCancellation = useToolCancellation(root, tools);
  const handlers = useCanvasToolGesture({
    tool,
    subscribeCancellation,
    normalize: (event) => normalizeToolPointer(canvas, root, event),
  });
  return (
    <svg
      data-canvas-control=""
      aria-label="Tool capture"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
      onPointerDown={(event) => {
        handlers.pointerDown(event);
        if (event.defaultPrevented) {
          root.focus({ preventScroll: true });
        }
      }}
      onPointerMove={handlers.pointerMove}
      onPointerUp={handlers.pointerUp}
      onPointerCancel={handlers.pointerCancel}
      onPointerLeave={handlers.pointerLeave}
    >
      <rect width="100%" height="100%" fill="transparent" />
    </svg>
  );
}

/**
 * Observes local Escape and browser blur for tool cancellation.
 *
 * @param root - Viewport receiving keyboard input.
 * @param tools - Session supplying the registered fallback tool.
 * @returns Stable subscriber that releases both listeners on cleanup.
 */
function useToolCancellation(root: HTMLElement, tools: Pick<CanvasToolSession, "reset">) {
  const subscribeCancellation = useCallback(
    (cancel: () => boolean) => {
      /**
       * Cancels the captured preview before falling back to the default tool.
       *
       * @param event - Keyboard input within this canvas.
       * @returns Escape cancels the local gesture or resets tool selection.
       */
      const key = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          if (!cancel()) {
            tools.reset();
          }
          event.preventDefault();
        }
      };
      root.addEventListener("keydown", key);
      window.addEventListener("blur", cancel);
      return () => {
        root.removeEventListener("keydown", key);
        window.removeEventListener("blur", cancel);
      };
    },
    [root, tools],
  );
  return subscribeCancellation;
}

/**
 * Converts native pointer input to world coordinates and current snapping policy.
 *
 * @param canvas - Scene supplying the live camera and snapping settings.
 * @param root - Viewport defining the client-coordinate origin.
 * @param event - Browser pointer sample.
 * @returns A tool sample with world coordinates and zoom-adjusted snapping threshold.
 */
function normalizeToolPointer(
  canvas: CanvasToolLayerProps["canvas"],
  root: HTMLElement,
  event: PointerEvent,
) {
  const rect = root.getBoundingClientRect();
  const zoom = canvas.camera.get().zoom;
  const snapping = canvas.snapping.get();
  return {
    point: canvas.toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }),
    pointerId: event.pointerId,
    button: event.button,
    shiftKey: event.shiftKey,
    zoom,
    snapping: {
      snapToGrid: snapping.snap,
      alignObjects: snapping.align,
      grid: snapping.grid,
      threshold: 8 / zoom,
      disabled: event.altKey,
    },
  };
}
