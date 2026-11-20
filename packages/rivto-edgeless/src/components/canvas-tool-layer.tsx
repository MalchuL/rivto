import { ReactCanvasTool } from "../tools/react-canvas-tool";
import { subscribeCanvasToolCancellation } from "../browser/canvas-tool-cancellation";
import { useCallback, useRef, useSyncExternalStore, type RefObject } from "react";
import type { CanvasToolSession } from "../types/tool-session";
import type { CanvasPointerInput } from "../browser/types";
import type { CanvasToolAttachment, CanvasToolLayerProps, CanvasToolPreviewProps } from "./types";
export type { CanvasToolPreviewProps } from "./types";
import { useCanvasToolGesture } from "../hooks/use-canvas-tool-gesture";

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
export function CanvasToolLayer({
  canvas,
  rootIdentity,
  viewport,
  attachment: attachmentStore,
  tool,
  tools,
}: CanvasToolLayerProps) {
  const attachment = useSyncExternalStore(
    attachmentStore.subscribe,
    attachmentStore.get,
    () => null,
  );
  const activeAttachment = useRef<CanvasToolAttachment | null>(null);
  const subscribeCancellation = useToolCancellation(viewport, tools, attachment, activeAttachment);
  const focus = useCallback(() => attachment?.focus(), [attachment]);
  useCanvasToolGesture({
    tool,
    subscribeCancellation,
    events: viewport.events,
    captureSelector: "[data-canvas-tool-capture]",
    onCapture: focus,
    normalize: (event) => {
      if (
        !attachment ||
        attachment.rootIdentity !== rootIdentity ||
        activeAttachment.current !== attachment ||
        attachmentStore.get() !== attachment
      ) {
        return undefined;
      }
      const sample = normalizeToolPointer(canvas, attachment.coordinates, event);
      if (activeAttachment.current !== attachment || attachmentStore.get() !== attachment) {
        return undefined;
      }
      return sample;
    },
  });
  return (
    <svg
      data-canvas-control=""
      data-canvas-tool-capture=""
      aria-label="Tool capture"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
    >
      <rect width="100%" height="100%" fill="transparent" />
    </svg>
  );
}

/**
 * Observes Escape and blur for the exact rendered attachment.
 *
 * @param viewport - Borrowed normalized input observation.
 * @param tools - Session supplying the registered fallback tool.
 * @param attachment - Exact attachment captured by this render, or null before mounting.
 * @param activeAttachment - Records the attachment whose cancellation observers are installed.
 * @returns Subscriber releasing both observations and invalidating the captured attachment.
 */
function useToolCancellation(
  viewport: CanvasToolLayerProps["viewport"],
  tools: Pick<CanvasToolSession, "reset">,
  attachment: CanvasToolAttachment | null,
  activeAttachment: RefObject<CanvasToolAttachment | null>,
) {
  return useCallback(
    (cancel: () => boolean) => {
      const release = subscribeCanvasToolCancellation(viewport.events, tools, cancel);
      activeAttachment.current = attachment;
      return () => {
        if (activeAttachment.current === attachment) {
          activeAttachment.current = null;
        }
        release();
      };
    },
    [viewport, tools, attachment, activeAttachment],
  );
}

/**
 * Converts detached pointer input to world coordinates and current snapping policy.
 *
 * @param canvas - Scene supplying the live camera and snapping settings.
 * @param coordinates - Captured occurrence converting client coordinates to world coordinates.
 * @param event - Copied pointer coordinates and modifiers.
 * @returns A tool sample with world coordinates and zoom-adjusted snapping threshold,
 * or undefined when the viewport is no longer attached.
 */
function normalizeToolPointer(
  canvas: CanvasToolLayerProps["canvas"],
  coordinates: CanvasToolAttachment["coordinates"],
  event: CanvasPointerInput,
) {
  const point = coordinates.clientToWorld({ x: event.clientX, y: event.clientY });
  if (!point) {
    return undefined;
  }
  const zoom = canvas.camera.get().zoom;
  const snapping = canvas.snapping.get();
  return {
    point,
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
