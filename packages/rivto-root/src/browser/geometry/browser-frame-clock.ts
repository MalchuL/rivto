import type { FrameCallback, FrameClock } from "../../geometry/types";

/** Frame timing and scheduling for one captured browser window. */
export class BrowserFrameClock implements FrameClock {
  /**
   * Captures the window and checks ownership before each new operation.
   *
   * @param view - Window whose clock and frames are used.
   * @param isCurrent - Checks the exact Root and document association.
   */
  constructor(
    private readonly view: Window,
    private readonly isCurrent: () => boolean,
  ) {}

  /**
   * Reads the captured window's monotonic clock.
   *
   * @returns Milliseconds, or undefined when ownership ends during the read.
   * @throws Propagates browser clock access and attachment-check failures.
   */
  now(): number | undefined {
    if (!this.isCurrent()) {
      return undefined;
    }
    const now = this.view.performance.now();
    return this.isCurrent() ? now : undefined;
  }

  /**
   * Requests a frame while the originating Root remains current.
   *
   * An accepted callback remains runnable after detachment unless cancelled,
   * allowing its owner to check attachment and release pending work. The
   * returned cancellation remains usable after detachment.
   *
   * @param callback - Work to invoke at the next browser animation frame.
   * @returns Idempotent frame cancellation, or undefined when the occurrence is no longer current.
   * @throws Propagates browser scheduling and attachment-check failures.
   */
  requestFrame(callback: FrameCallback): (() => void) | undefined {
    if (!this.isCurrent()) {
      return undefined;
    }
    let active = true;
    const frame = this.view.requestAnimationFrame(() => {
      if (active) {
        active = false;
        callback();
      }
    });
    return () => {
      if (active) {
        active = false;
        this.view.cancelAnimationFrame(frame);
      }
    };
  }
}
