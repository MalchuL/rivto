import type { CanvasTool, CanvasToolPointer } from "../core/tools/canvas-tool";

/**
 * Converts native browser input to the receiving canvas coordinates.
 *
 * @param event - Native pointer sample.
 * @returns World coordinates, modifiers and current snapping policy.
 */
export type CanvasPointerNormalizer = (event: PointerEvent) => CanvasToolPointer;

/** Owns one tool's native pointer capture without a React or application event dependency. */
export class CanvasToolGesture {
  private captured: { host: Element; id: number } | null = null;

  /**
   * Binds pointer routing to a fixed tool instance without installing browser listeners.
   *
   * @param tool - Receiving tool, absent while no registration is active.
   * @param normalize - Converts browser samples using the receiving scene's current camera.
   */
  constructor(
    private readonly tool:
      | Pick<CanvasTool, "pointerDown" | "pointerMove" | "pointerUp" | "pointerLeave" | "cancel">
      | undefined,
    private normalize: CanvasPointerNormalizer,
  ) {}

  /**
   * Reads whether a pointer is currently owned by this gesture.
   *
   * @returns True between accepted pointerdown and release or cancellation.
   */
  get isCaptured(): boolean {
    return this.captured !== null;
  }

  /**
   * Replaces coordinate normalization without interrupting an accepted pointer.
   *
   * @param normalize - Conversion used by subsequent browser input samples.
   * @returns Routing uses the new coordinate and modifier policy.
   */
  update(normalize: CanvasPointerNormalizer): void {
    this.normalize = normalize;
  }

  /**
   * Starts the registered tool and captures only accepted pointers.
   *
   * @param event - Native pointer sample from the capture layer.
   * @param host - Mounted element that owns capture for the admitted pointer.
   * @returns Delivers the sample and updates browser capture when required.
   * @throws Tool or browser failures propagate after cancellation and release.
   */
  pointerDown(event: PointerEvent, host: Element): void {
    if (!this.tool || this.captured || event.button !== 0) {
      return;
    }
    try {
      if (this.tool.pointerDown(this.normalize(event))) {
        host.setPointerCapture(event.pointerId);
        this.captured = { host, id: event.pointerId };
        event.preventDefault();
      }
    } catch (error) {
      this.cancel();
      throw error;
    }
  }

  /**
   * Routes hover and accepted pointer motion without document-specific behavior.
   *
   * @param event - Native pointer sample from the capture layer.
   * @returns Delivers the sample and updates browser capture when required.
   * @throws Tool failures propagate after cancellation and release.
   */
  pointerMove(event: PointerEvent): void {
    if (!this.captured || this.captured.id === event.pointerId) {
      try {
        this.tool?.pointerMove(this.normalize(event));
      } catch (error) {
        this.cancel();
        throw error;
      }
    }
  }

  /**
   * Commits the accepted gesture and releases capture even if the tool rejects it.
   *
   * @param event - Native pointer sample from the capture layer.
   * @returns Delivers the sample and updates browser capture when required.
   * @throws Tool failures propagate after cancellation and release.
   */
  pointerUp(event: PointerEvent): void {
    if (this.captured?.id !== event.pointerId) {
      return;
    }
    try {
      this.tool?.pointerUp(this.normalize(event));
    } catch (error) {
      this.tool?.cancel();
      throw error;
    } finally {
      this.release();
    }
  }

  /**
   * Cancels only the pointer currently owned by this adapter.
   *
   * @param event - Native pointer sample from the capture layer.
   * @returns Delivers the sample and updates browser capture when required.
   */
  pointerCancel(event: PointerEvent): void {
    if (this.captured?.id === event.pointerId) {
      this.cancel();
    }
  }

  /**
   * Lets the active tool remove hover feedback without releasing a captured drag.
   *
   * @returns Delegates hover cleanup to the current tool.
   */
  pointerLeave(): void {
    this.tool?.pointerLeave();
  }

  /**
   * Discards captured gesture state or the active hover preview.
   *
   * @returns Whether the tool cancelled a gesture; browser capture is always released.
   * @throws Tool cancellation failures propagate after releasing browser capture.
   */
  cancel(): boolean {
    try {
      return this.tool?.cancel() ?? false;
    } finally {
      this.release();
    }
  }

  /**
   * Releases the browser pointer owned by this adapter.
   *
   * @returns Clears capture bookkeeping even when the browser already released capture.
   */
  private release(): void {
    const active = this.captured;
    this.captured = null;
    if (active?.host.hasPointerCapture(active.id)) {
      active.host.releasePointerCapture(active.id);
    }
  }
}
