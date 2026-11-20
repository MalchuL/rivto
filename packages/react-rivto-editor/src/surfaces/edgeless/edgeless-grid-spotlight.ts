import type {
  FrameClock,
  InputRegion,
  InputRoot,
  PointerInput,
  RegionBounds,
} from "@chulane/rivto-root";
import type { EdgelessSpotlightAttachment } from "./types";

/** Owns the host grid decoration's viewport measurements and pending paint frame. */
export class EdgelessGridSpotlight {
  private attachment?: EdgelessSpotlightAttachment;
  private spotlightPoint = { x: 0, y: 0 };
  private viewportOrigin = { left: 0, top: 0 };

  /**
   * Observes viewport layout and scrolling and owns the overlay style session.
   *
   * Camera translation moves the world plane rather than this viewport. Its
   * cached client origin follows resize and ancestor scrolling instead of forcing
   * a layout read after every camera paint or newly mounted card.
   *
   * @param root - Borrowed exact occurrence for attachment and gesture markers.
   * @param viewport - Borrowed region providing viewport bounds and observation.
   * @param overlay - Borrowed region providing spotlight-only style ownership.
   * @param clock - Borrowed occurrence-bound animation frame scheduler.
   * @returns Cleanup disconnecting observation, cancelling the frame, and releasing styles.
   * @throws If already attached or if observation setup or cleanup fails.
   */
  attach(
    root: Pick<InputRoot, "isAttached" | "readAttribute">,
    viewport: Pick<InputRegion, "readBounds" | "observeBounds">,
    overlay: Pick<InputRegion, "captureStyles">,
    clock: Pick<FrameClock, "requestFrame">,
  ): () => void {
    if (this.attachment) {
      throw new Error("Grid spotlight is already attached");
    }
    const styles = overlay.captureStyles([
      "--rivto-edgeless-pointer-x",
      "--rivto-edgeless-pointer-y",
    ]);
    if (!styles) {
      return () => {};
    }
    try {
      if (!root.isAttached()) {
        styles.finish({});
        return () => {};
      }
    } catch (error) {
      try {
        styles.finish({});
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Grid spotlight setup failed");
      }
      throw error;
    }
    const attachment: EdgelessSpotlightAttachment = { root, viewport, styles, clock };
    this.attachment = attachment;
    try {
      const release = viewport.observeBounds((bounds) => this.updateOrigin(attachment, bounds));
      if (this.attachment !== attachment || !root.isAttached()) {
        release();
        this.detach(attachment);
        return () => {};
      }
      attachment.releaseBounds = release;
      return () => this.detach(attachment);
    } catch (error) {
      try {
        this.detach(attachment);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Grid spotlight setup failed");
      }
      throw error;
    }
  }

  /**
   * Caches the viewport's client origin so pointermove can avoid layout reads.
   *
   * @returns The cached client origin is refreshed when the occurrence is current.
   * @throws Propagates occurrence ownership and region measurement failures.
   */
  refreshViewportOrigin = (): void => {
    const attachment = this.attachment;
    const bounds = attachment?.viewport.readBounds();
    if (attachment && bounds) {
      this.updateOrigin(attachment, bounds);
    }
  };

  /**
   * Moves the CSS-rendered grid spotlight without causing a React render.
   *
   * Writes `--rivto-edgeless-pointer-x/y` only on the empty overlay so inherited
   * custom properties do not restyle the canvas tree. Skipped during transform
   * and pan so those gestures do not also invalidate spotlight styles.
   *
   * @param event - Pointer movement bubbling through the edgeless viewport.
   * @returns At most one animation frame is scheduled to paint the latest pointer position.
   * @throws Propagates occurrence ownership and frame scheduling failures.
   */
  updatePointerSpotlight = (event: Pick<PointerInput, "clientX" | "clientY">): void => {
    const attachment = this.attachment;
    if (!attachment?.root.isAttached()) {
      return;
    }
    this.spotlightPoint = { x: event.clientX, y: event.clientY };
    if (attachment.cancelFrame) {
      return;
    }
    const cancel = attachment.clock.requestFrame(() => this.paint(attachment));
    try {
      if (this.attachment === attachment && attachment.root.isAttached()) {
        attachment.cancelFrame = cancel;
      } else {
        cancel?.();
      }
    } catch (error) {
      try {
        cancel?.();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Grid spotlight frame setup failed");
      }
      throw error;
    }
  };

  /**
   * Stores a measured origin only while its captured occurrence is current.
   *
   * @param attachment - Occurrence that produced the measurement.
   * @param bounds - Detached viewport bounds in CSS pixels.
   * @returns The cached origin is updated when the attachment remains current.
   */
  private updateOrigin(attachment: EdgelessSpotlightAttachment, bounds: RegionBounds): void {
    if (this.attachment === attachment && attachment.root.isAttached()) {
      this.viewportOrigin = { left: bounds.left, top: bounds.top };
    }
  }

  /**
   * Paints the latest pointer location while no pan or transform is active.
   *
   * @param attachment - Occurrence that scheduled this frame.
   * @returns The current overlay receives its local pointer coordinates when eligible.
   * @throws Propagates marker reads, ownership checks, and style updates.
   */
  private paint(attachment: EdgelessSpotlightAttachment): void {
    attachment.cancelFrame = undefined;
    if (this.attachment !== attachment || !attachment.root.isAttached()) {
      return;
    }
    if (
      attachment.root.readAttribute("data-transforming") ||
      attachment.root.readAttribute("data-panning") === "true"
    ) {
      return;
    }
    if (this.attachment !== attachment || !attachment.root.isAttached()) {
      return;
    }
    attachment.styles.set({
      "--rivto-edgeless-pointer-x": `${this.spotlightPoint.x - this.viewportOrigin.left}px`,
      "--rivto-edgeless-pointer-y": `${this.spotlightPoint.y - this.viewportOrigin.top}px`,
    });
  }

  /**
   * Releases only the resources belonging to the supplied spotlight occurrence.
   *
   * @param attachment - Captured owner whose pending work and styles must be released.
   * @returns The captured observation and frame are released even after Root detachment.
   * @throws AggregateError if any cleanup fails.
   */
  private detach(attachment: EdgelessSpotlightAttachment): void {
    if (this.attachment === attachment) {
      this.attachment = undefined;
    }
    const errors: unknown[] = [];
    for (const release of [
      attachment.cancelFrame,
      attachment.releaseBounds,
      () => attachment.styles.finish({}),
    ]) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    attachment.cancelFrame = undefined;
    attachment.releaseBounds = undefined;
    if (errors.length) {
      throw new AggregateError(errors, "Grid spotlight cleanup failed");
    }
  }
}
