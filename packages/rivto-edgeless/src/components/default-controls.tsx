import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { CanvasTransformControls } from "./browser/transform-controls";
import { CanvasTransformAdapter } from "./canvas-transform-adapter";
import { useCanvasViewport } from "./canvas-viewport-context";
import { useCanvasViewportLayers } from "./browser/use-canvas-viewport-layers";
import type { CanvasTransformInput, DefaultControlsProps } from "./types";

/**
 * Connects generic transform controls to the canvas preview and commit lifecycle.
 *
 * @param props - Independent canvas using the mounted viewport.
 * @param props.canvas - Scene owning selection and transforms.
 * @returns Default transform controls; consumers with document policies may supply their own adapter.
 */
export function DefaultControls({ canvas }: DefaultControlsProps) {
  const viewport = useCanvasViewport();
  const layers: CanvasTransformInput | null = useCanvasViewportLayers();
  const adapter = useMemo(
    () => (layers ? new CanvasTransformAdapter(canvas, layers) : null),
    [canvas, layers],
  );
  const transforming = useSyncExternalStore(
    canvas.transform.subscribe,
    () => canvas.transform.get() !== null,
  );
  useLayoutEffect(() => {
    if (!transforming) {
      // Cancellation restores element DOM during React commit; measure it afterwards.
      adapter?.stop();
    }
  }, [adapter, transforming]);
  useLayoutEffect(() => {
    if (!adapter || !viewport) {
      return;
    }
    return viewport.events.register({
      id: "canvas.controls.default-drag",
      type: "mousedown",
      handle: (event) => adapter.startDrag(event),
    });
  }, [adapter, viewport]);
  return adapter ? <CanvasTransformControls canvas={canvas} adapter={adapter} /> : null;
}
