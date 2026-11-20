import type { RegionBoundsObserver } from "../../geometry/types";

/**
 * Observes viewport bounds while the captured region belongs to its occurrence.
 *
 * Resize, captured ancestor scroll, and window resize each refresh the bounds.
 * Cleanup releases the original window and observer even after detachment.
 *
 * @param element - Browser region measured by this private adapter.
 * @param isCurrent - Checks the captured region and occurrence.
 * @param observer - Receives a detached bounds snapshot after each measurement.
 * @returns Idempotent disposer for all acquired observation resources.
 * @throws Propagates setup, measurement, observer, and cleanup failures.
 */
export function observeRegionBounds(
  element: Element,
  isCurrent: () => boolean,
  observer: RegionBoundsObserver,
): () => void {
  return new RegionBoundsObservation(element, isCurrent, observer).start();
}

/** Owns the captured browser resources used to observe one region's bounds. */
class RegionBoundsObservation {
  private readonly document: Document;
  private readonly view: Window | null;
  private readonly cleanups: (() => void)[] = [];
  private active = true;

  /**
   * Captures the region and occurrence whose geometry is observed.
   *
   * @param element - Browser region measured by this private adapter.
   * @param isCurrent - Checks the captured region and occurrence.
   * @param observer - Receives detached bounds snapshots.
   */
  constructor(
    private readonly element: Element,
    private readonly isCurrent: () => boolean,
    private readonly observer: RegionBoundsObserver,
  ) {
    this.document = element.ownerDocument;
    this.view = this.document.defaultView;
  }

  /**
   * Installs observation and rolls back resources if setup fails.
   *
   * @returns Idempotent disposer for all acquired observation resources.
   * @throws Propagates setup failures and aggregates failed rollback.
   */
  start(): () => void {
    try {
      this.measure();
      if (this.view && this.isActive()) {
        const ResizeObserverType = this.document.defaultView?.ResizeObserver;
        if (ResizeObserverType) {
          const resizeObserver = new ResizeObserverType(this.measure);
          this.cleanups.push(() => resizeObserver.disconnect());
          resizeObserver.observe(this.element);
        }
        const view = this.view;
        this.cleanups.push(() => view.removeEventListener("scroll", this.measure, true));
        view.addEventListener("scroll", this.measure, { capture: true, passive: true });
        this.cleanups.push(() => view.removeEventListener("resize", this.measure));
        view.addEventListener("resize", this.measure);
      }
      if (!this.isActive()) {
        this.dispose();
      }
      return this.dispose;
    } catch (error) {
      try {
        this.dispose();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Region bounds setup failed");
      }
      throw error;
    }
  }

  /**
   * Checks the captured attachment and document before browser operations.
   *
   * @returns Whether this observation still belongs to its captured occurrence.
   * @throws Propagates occurrence ownership failures.
   */
  private isActive(): boolean {
    return (
      this.active && this.isCurrent() && this.active && this.element.ownerDocument === this.document
    );
  }

  /**
   * Measures and publishes current bounds without retaining a browser rectangle.
   *
   * @returns The observer receives bounds only while the region remains current.
   * @throws Propagates geometry, ownership, and observer failures.
   */
  private measure = (): void => {
    if (!this.isActive()) {
      return;
    }
    const { left, top, width, height } = this.element.getBoundingClientRect();
    if (this.isActive()) {
      this.observer({ left, top, width, height });
    }
  };

  /**
   * Releases every acquired resource even if one removal fails.
   *
   * @returns All observation resources have been released.
   * @throws AggregateError if any cleanup fails.
   */
  private dispose = (): void => {
    if (!this.active) {
      return;
    }
    this.active = false;
    const errors: unknown[] = [];
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Region bounds cleanup failed");
    }
  };
}
