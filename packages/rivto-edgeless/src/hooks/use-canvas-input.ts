import { CanvasInputController } from "../browser/canvas-input-controller";
import type { CanvasInputBinding } from "./types";
import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { canvasViewportAttachment } from "../browser/canvas-viewport-attachment";

/**
 * Connects a browser input controller to the lifetime of a React-mounted viewport.
 *
 * Native gesture state belongs to the controller; renders only replace its host
 * policies. Changing the scene or viewport identity releases the previous connection.
 *
 * @param input - Scene, mounted viewport and current native-input policies.
 * @returns Browser handlers are connected until the viewport changes or unmounts.
 */
export function useCanvasInput(input: CanvasInputBinding): void {
  const attachment = canvasViewportAttachment(input.viewport);
  const layers = useSyncExternalStore(attachment.subscribe, attachment.get, () => null);
  const controller = useMemo(() => {
    if (!input.rootIdentity || layers?.rootIdentity !== input.rootIdentity) {
      return null;
    }
    return new CanvasInputController(input.canvas, input.viewport.events, layers.inputRoot, input);
  }, [input.canvas, input.rootIdentity, input.viewport.events, layers]);
  useLayoutEffect(() => controller?.update(input));
  useLayoutEffect(() => controller?.connect(), [controller]);
}
