/** Reserves one pointer gesture per occurrence across selection and dragging. */
export class BlockPointerOwnership {
  private active: object | undefined;

  /**
   * Acquires exclusive ownership until the returned disposer is invoked.
   *
   * The gesture owner releases its reservation on completion, cancellation,
   * attachment loss and extension removal. A stale disposer cannot release a later gesture.
   *
   * @param root - Attached editor root whose embedded frames must not intercept this gesture.
   * @returns Idempotent release function, or undefined while another gesture owns input.
   */
  acquire(root?: HTMLElement): (() => void) | undefined {
    if (this.active) {
      return undefined;
    }
    const token = {};
    this.active = token;
    root?.setAttribute("data-rivto-pointer-active", "");
    return () => {
      if (this.active === token) {
        this.active = undefined;
        root?.removeAttribute("data-rivto-pointer-active");
      }
    };
  }
}
