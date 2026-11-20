import type { CanvasTool } from "../core/tools/canvas-tool";
import type {
  CanvasPointerCapture,
  CanvasPointerDownInput,
  CanvasPointerInput,
  CanvasPointerNormalizer,
} from "./types";

/** Owns one tool's pointer capture without a React or application event dependency. */
export class CanvasToolGesture {
  private captured: CanvasPointerCapture | null = null;

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
   * @param event - Detached pointer sample and current delivery's capture capabilities.
   * A missing normalized sample does not begin or capture a gesture.
   *
   * @returns Delivers an available sample and updates browser capture when required.
   * @throws Tool or browser failures propagate after cancellation and release.
   */
  pointerDown(event: CanvasPointerDownInput): void {
    if (!this.tool || this.captured || event.button !== 0) {
      return;
    }
    let canceling = false;
    try {
      const input = this.normalize(event);
      if (input && this.tool.pointerDown(input)) {
        const release = event.capture();
        if (!release) {
          canceling = true;
          this.tool.cancel();
          return;
        }
        this.captured = { release, id: event.pointerId };
        event.preventDefault();
      }
    } catch (error) {
      if (!canceling) {
        this.cancel();
      }
      throw error;
    }
  }

  /**
   * Routes hover and accepted pointer motion without document-specific behavior.
   *
   * @param event - Detached pointer sample from the capture layer.
   * A missing normalized sample cancels the tool and releases any capture.
   *
   * @returns Delivers an available sample and updates browser capture when required.
   * @throws Tool failures propagate after cancellation and release.
   */
  pointerMove(event: CanvasPointerInput): void {
    if (!this.captured || this.captured.id === event.pointerId) {
      if (!this.tool) {
        return;
      }
      try {
        const input = this.normalize(event);
        if (input) {
          this.tool.pointerMove(input);
          return;
        }
      } catch (error) {
        this.cancel();
        throw error;
      }
      this.cancel();
    }
  }

  /**
   * Commits the accepted gesture and releases capture even if the tool rejects it.
   *
   * @param event - Detached pointer sample from the capture layer.
   * A missing normalized sample cancels instead of committing the gesture.
   *
   * @returns Delivers an available sample and updates browser capture when required.
   * @throws Tool failures propagate after cancellation and release.
   */
  pointerUp(event: CanvasPointerInput): void {
    if (this.captured?.id !== event.pointerId) {
      return;
    }
    let canceling = false;
    try {
      if (!this.tool) {
        return;
      }
      const input = this.normalize(event);
      if (input) {
        this.tool.pointerUp(input);
      } else {
        canceling = true;
        this.tool.cancel();
      }
    } catch (error) {
      if (!canceling) {
        this.tool?.cancel();
      }
      throw error;
    } finally {
      this.release();
    }
  }

  /**
   * Cancels only the pointer currently owned by this adapter.
   *
   * @param event - Detached pointer sample from the capture layer.
   * @returns Delivers the sample and updates browser capture when required.
   */
  pointerCancel(event: CanvasPointerInput): void {
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
    active?.release();
  }
}
