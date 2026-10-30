import { useEffect, useLayoutEffect, useMemo, type PointerEvent as ReactPointerEvent } from "react";
import type { CanvasTool } from "../core/tools/canvas-tool";
import { CanvasToolGesture, type CanvasPointerNormalizer } from "../browser/canvas-tool-gesture";

/** Gesture dependencies borrowed by the React pointer adapter. */
export interface CanvasToolGestureProps {
  readonly tool?: Pick<
    CanvasTool,
    "pointerDown" | "pointerMove" | "pointerUp" | "pointerLeave" | "cancel"
  >;
  readonly normalize: CanvasPointerNormalizer;
  /**
   * Connects host keyboard and deactivation policies to the captured gesture.
   *
   * @param cancel - Cancels local preview and releases capture.
   * @param isCaptured - Reads whether a pointer currently belongs to this hook.
   * @returns Cleanup releasing host listeners.
   */
  readonly subscribeCancellation: (cancel: () => boolean, isCaptured: () => boolean) => () => void;
}

/**
 * Routes React events through a browser-owned tool gesture and host cancellation policy.
 *
 * Tool implementations own geometry and preview state. The browser class only normalizes
 * input, releases capture and routes cancellation; it never inspects tool IDs.
 *
 * @param props - Active instance, pointer normalization and host cancellation subscriptions.
 * @returns Pointer handlers for the common capture layer.
 */
export function useCanvasToolGesture({
  tool,
  normalize,
  subscribeCancellation,
}: CanvasToolGestureProps) {
  const gesture = useMemo(() => new CanvasToolGesture(tool, normalize), [tool]);
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

  return useMemo(() => new ReactToolGesture(gesture).getHandlers(), [gesture]);
}

/** Adapts React synthetic events without leaking React into browser pointer capture. */
class ReactToolGesture {
  /**
   * Binds React handlers to the browser gesture owned by this hook.
   *
   * @param gesture - Browser owner of normalization, capture and cancellation.
   */
  constructor(private readonly gesture: CanvasToolGesture) {}
  /**
   * Exposes synthetic-event handlers without exposing the browser gesture owner.
   *
   * @returns Bound callbacks suitable for React pointer properties.
   */
  getHandlers() {
    return {
      pointerDown: this.pointerDown,
      pointerMove: this.pointerMove,
      pointerUp: this.pointerUp,
      pointerCancel: this.pointerCancel,
      pointerLeave: this.pointerLeave,
    };
  }

  /**
   * Forwards admitted pointer input and preserves React's handled-event marker.
   *
   * @param event - React pointer sample and its mounted capture host.
   * @returns Native capture and React default prevention reflect the tool's admission.
   */
  pointerDown = (event: ReactPointerEvent<Element>) => {
    this.gesture.pointerDown(event.nativeEvent, event.currentTarget);
    if (event.nativeEvent.defaultPrevented) {
      event.preventDefault();
    }
  };
  /**
   * Forwards hover or captured motion to the browser gesture owner.
   *
   * @param event - React pointer sample from the capture layer.
   * @returns The tool receives only eligible pointer samples.
   */
  pointerMove = (event: ReactPointerEvent<Element>) => {
    this.gesture.pointerMove(event.nativeEvent);
  };
  /**
   * Completes a matching captured gesture through the browser owner.
   *
   * @param event - React pointer release sample.
   * @returns The tool commits and browser capture is released.
   */
  pointerUp = (event: ReactPointerEvent<Element>) => {
    this.gesture.pointerUp(event.nativeEvent);
  };
  /**
   * Cancels a matching pointer while preserving unrelated contacts.
   *
   * @param event - React pointer cancellation sample.
   * @returns A matching captured preview is discarded.
   */
  pointerCancel = (event: ReactPointerEvent<Element>) => {
    this.gesture.pointerCancel(event.nativeEvent);
  };
  /**
   * Removes hover feedback without releasing the browser's active pointer.
   *
   * @returns The tool receives hover cleanup.
   */
  pointerLeave = () => {
    this.gesture.pointerLeave();
  };
}
