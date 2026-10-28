import { CanvasTool, type CanvasToolOptions } from "./canvas-tool";

/** Uses the receiving viewport's primary-pointer pan behavior instead of capturing object gestures. */
export class CanvasPanTool<
  Options extends CanvasToolOptions = CanvasToolOptions,
> extends CanvasTool<Options> {
  override readonly pansViewport = true;
}
