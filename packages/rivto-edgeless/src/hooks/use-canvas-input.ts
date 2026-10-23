import { CanvasInputController } from "../browser/canvas-input-controller";
import type { CanvasInputOptions, CanvasInputScene } from "../browser/types";
import { useLayoutEffect, useMemo } from "react";
import type { CanvasEvents } from "../browser/canvas-events";

/** Mounted scene and borrowed input registrations with live admission policies. */
export interface CanvasInputBinding extends CanvasInputOptions {
  readonly canvas: CanvasInputScene;
  readonly root: HTMLElement | null;
  readonly events: Pick<CanvasEvents, "register">;
}

/**
 * Connects a browser input controller to the lifetime of a React-mounted viewport.
 *
 * Native gesture state belongs to the controller; renders only replace its host
 * policies. Changing the scene or DOM root releases the previous connection.
 *
 * @param input - Scene, mounted viewport and current native-input policies.
 * @returns Browser handlers are connected until the viewport changes or unmounts.
 */
export function useCanvasInput(input: CanvasInputBinding): void {
  const controller = useMemo(
    () =>
      input.root ? new CanvasInputController(input.canvas, input.root, input.events, input) : null,
    [input.canvas, input.root, input.events],
  );
  useLayoutEffect(() => controller?.update(input));
  useLayoutEffect(() => controller?.connect(), [controller]);
}
