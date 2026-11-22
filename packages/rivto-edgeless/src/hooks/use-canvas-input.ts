import { CanvasInputController } from "../browser/canvas-input-controller";
import type { CanvasInputBinding } from "./types";
import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";

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
  const { attachment, events } = input;
  const layers = useSyncExternalStore(attachment.subscribe, attachment.get, () => null);
  const controller = useMemo(() => {
    if (!input.rootIdentity || layers?.rootIdentity !== input.rootIdentity) {
      return null;
    }
    return new CanvasInputController(input.canvas, events, layers.inputRoot, input);
  }, [input.canvas, input.rootIdentity, events, layers]);
  useLayoutEffect(() => controller?.update(input));
  useLayoutEffect(() => controller?.connect(), [controller]);
}
