import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import type { CanvasApi } from "../core/canvas";
import { CanvasTransformControls } from "./transform-controls";
import { CanvasTransformAdapter } from "./canvas-transform-adapter";

/** Scene and mounted layers borrowed by the default transform controls. */
interface DefaultControlsProps {
  readonly canvas: CanvasApi;
  readonly root: HTMLElement;
  readonly plane: HTMLElement;
}

/**
 * Connects generic transform controls to the canvas preview and commit lifecycle.
 *
 * @param props - Independent canvas and its mounted DOM layers.
 * @param props.canvas - Scene owning selection and transforms.
 * @param props.root - Focusable viewport receiving native drag input.
 * @param props.plane - World layer containing the geometry hosts.
 * @returns Default transform controls; consumers with document policies may supply their own adapter.
 */
export function DefaultControls({ canvas, root, plane }: DefaultControlsProps) {
  const adapter = useMemo(() => new CanvasTransformAdapter(canvas, plane), [canvas, plane]);
  const transforming = useSyncExternalStore(
    canvas.transform.subscribe,
    () => canvas.transform.get() !== null,
  );
  useLayoutEffect(() => {
    if (!transforming) {
      // Cancellation restores element DOM during React commit; measure it afterwards.
      adapter.stop();
    }
  }, [adapter, transforming]);
  useLayoutEffect(() => {
    /**
     * Forwards native drag admission to this surface's transform adapter.
     *
     * @param event - Mouse input inside the viewport.
     * @returns Eligible targets begin a move preview.
     */
    const startDrag = (event: MouseEvent) => adapter.startDrag(event, root);
    root.addEventListener("mousedown", startDrag);
    return () => root.removeEventListener("mousedown", startDrag);
  }, [adapter, root]);
  return <CanvasTransformControls canvas={canvas} plane={plane} adapter={adapter} />;
}
