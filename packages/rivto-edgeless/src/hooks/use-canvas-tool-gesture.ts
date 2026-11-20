import { useEffect, useId, useLayoutEffect, useMemo } from "react";
import { CanvasToolGesture } from "../browser/canvas-tool-gesture";
import { subscribeCanvasToolInput } from "../browser/canvas-tool-input";
import type { CanvasToolGestureProps } from "./types";

/**
 * Routes normalized viewport input through a browser-owned tool gesture and host cancellation policy.
 *
 * Tool implementations own geometry and preview state. The browser class only normalizes
 * input, releases capture and routes cancellation; it never inspects tool IDs.
 * Input registrations and cancellation subscriptions are released when their dependencies change.
 *
 * @param props - Active instance, pointer normalization, viewport input and host cancellation subscriptions.
 * @param props.tool - Current tool, or undefined when no tool is active.
 * @param props.normalize - Converts pointer samples into the tool's coordinates.
 * @param props.events - Viewport registration capability, or null while unavailable.
 * @param props.captureSelector - Selector identifying the active tool capture layer.
 * @param props.onCapture - Optional host action after a pointer is captured.
 * @param props.subscribeCancellation - Installs host cancellation and returns its cleanup.
 * @returns The tool gesture is subscribed to its capture layer while the viewport is available.
 */
export function useCanvasToolGesture({
  tool,
  normalize,
  events,
  captureSelector,
  onCapture,
  subscribeCancellation,
}: CanvasToolGestureProps): void {
  const gesture = useMemo(() => new CanvasToolGesture(tool, normalize), [tool]);
  const id = useId();
  useLayoutEffect(() => gesture.update(normalize));
  useEffect(() => {
    const stop = subscribeCancellation(
      () => gesture.cancel(),
      () => gesture.isCaptured,
    );
    return () => {
      try {
        stop();
      } finally {
        gesture.cancel();
      }
    };
  }, [subscribeCancellation, gesture]);
  useEffect(() => {
    if (!events) {
      return;
    }
    const release = subscribeCanvasToolInput(events, gesture, captureSelector, id, onCapture);
    return () => {
      const errors: unknown[] = [];
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
      try {
        if (gesture.isCaptured) {
          gesture.cancel();
        }
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) {
        throw new AggregateError(errors, "Tool gesture cleanup failed");
      }
    };
  }, [events, gesture, captureSelector, id, onCapture]);
}
