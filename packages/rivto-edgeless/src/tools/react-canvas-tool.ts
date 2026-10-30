import type { ReactNode } from "react";
import { CanvasTool, type CanvasToolOptions } from "../core/tools/canvas-tool";

/** Adds React preview presentation to the framework-neutral tool lifecycle. */
export class ReactCanvasTool<
  Options extends CanvasToolOptions = CanvasToolOptions,
> extends CanvasTool<Options> {
  /**
   * Renders local feedback using this instance's current state.
   *
   * @param _zoom - Canvas scale, where one is 100 percent.
   * @returns A React preview or null when this tool has none.
   */
  renderPreview(_zoom: number): ReactNode {
    return null;
  }
}
