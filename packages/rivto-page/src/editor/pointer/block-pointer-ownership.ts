/** Reserves one pointer gesture per occurrence across selection and dragging. */
export class BlockPointerOwnership {
  private active: object | undefined;

  /**
   * Acquires exclusive ownership until the returned disposer is invoked.
   *
   * The gesture owner releases its reservation on completion, cancellation,
   * attachment loss and extension removal. A stale disposer cannot release a later gesture.
   *
   * @returns Idempotent release function, or undefined while another gesture owns input.
   */
  acquire(): (() => void) | undefined {
    if (this.active) {
      return undefined;
    }
    const token = {};
    this.active = token;
    return () => {
      if (this.active === token) {
        this.active = undefined;
      }
    };
  }
}
