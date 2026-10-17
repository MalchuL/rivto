/** Subpixel residual at which animation stops without snapping to the network position. */
const REST_DISTANCE = 0.25;

/**
 * Owns the displayed pointer position and follows network targets using exponential smoothing.
 *
 * Only this controller writes the transform. Incoming targets never overwrite an
 * already displayed position. First appearance, zero smoothing and reduced motion are immediate.
 *
 * @param element - Mounted pointer decoration owned by this controller.
 * @param smoothingMs - Validated finite nonnegative EMA time constant in milliseconds; zero disables animation. Elapsed time keeps smoothing independent of refresh rate.
 * @returns Target updater and cleanup cancelling frames and the media-query listener.
 */
export function createPointerMotion(element: HTMLElement, smoothingMs: number) {
  const window = element.ownerDocument.defaultView!;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current: { x: number; y: number } | undefined;
  let target = { x: 0, y: 0 };
  let frame: number | undefined;
  let last = 0;
  /**
   * Writes the interpolated position without involving React state.
   *
   * @returns Updates the mounted pointer's transform.
   */
  function paint(): void {
    element.style.transform = `translate(${current!.x}px, ${current!.y}px)`;
  }
  /**
   * Advances the displayed position by the elapsed fraction of the exponential decay.
   *
   * @param now - Animation-frame timestamp in milliseconds.
   * @returns Paints one frame and schedules another only while visibly moving.
   */
  function tick(now: number): void {
    frame = undefined;
    const alpha = -Math.expm1(-(now - last) / smoothingMs);
    last = now;
    current!.x += (target.x - current!.x) * alpha;
    current!.y += (target.y - current!.y) * alpha;
    paint();
    if (Math.hypot(target.x - current!.x, target.y - current!.y) > REST_DISTANCE) {
      frame = window.requestAnimationFrame(tick);
    }
  }
  /**
   * Replaces the destination without resetting the active animation or displayed point.
   *
   * @param x - Target horizontal position relative to the panel, in CSS pixels.
   * @param y - Target vertical position relative to the panel, in CSS pixels.
   * @returns Starts smoothing, or places the pointer immediately when motion is reduced or smoothing is zero.
   */
  function update(x: number, y: number): void {
    target = { x, y };
    if (!current || reduced.matches || smoothingMs === 0) {
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
        frame = undefined;
      }
      current = { ...target };
      paint();
    } else if (frame === undefined && Math.hypot(x - current.x, y - current.y) > REST_DISTANCE) {
      last = window.performance.now();
      frame = window.requestAnimationFrame(tick);
    }
  }
  /**
   * Applies a live motion-preference change to the current destination.
   *
   * @returns Cancels interpolation immediately when reduced motion becomes enabled.
   */
  const preferenceChanged = () => update(target.x, target.y);
  reduced.addEventListener("change", preferenceChanged);
  return {
    update,
    /**
     * Releases the pointer's pending animation and preference subscription.
     *
     * @returns Prevents further scheduled writes to the removed decoration.
     */
    dispose(): void {
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
      }
      reduced.removeEventListener("change", preferenceChanged);
    },
  };
}
