import type { PointerEvent as ReactPointerEvent } from "react";

/** Owns the host grid decoration's viewport measurements and pending paint frame. */
export class EdgelessGridSpotlight {
  viewport: HTMLElement | null = null;
  spotlightOverlay: HTMLDivElement | null = null;
  private spotlightFrame: number | null = null;
  private spotlightPoint = { x: 0, y: 0 };
  private viewportOrigin = { left: 0, top: 0 };

  /**
   * Observes viewport layout and scrolling and cancels outstanding paint work on cleanup.
   *
   * Camera translation moves the world plane rather than this viewport. Its
   * cached client origin follows resize and ancestor scrolling instead of forcing
   * a layout read after every camera paint or newly mounted card.
   *
   * @returns Cleanup disconnecting the observer and layout listeners and cancelling the pending animation frame.
   */
  observeViewport(): () => void {
    const root = this.viewport;
    const view = root?.ownerDocument.defaultView;
    let observer: ResizeObserver | undefined;
    if (root && typeof ResizeObserver !== "undefined") {
      this.refreshViewportOrigin();
      observer = new ResizeObserver(this.refreshViewportOrigin);
      observer.observe(root);
    }
    view?.addEventListener("scroll", this.refreshViewportOrigin, { capture: true, passive: true });
    view?.addEventListener("resize", this.refreshViewportOrigin);
    return () => {
      observer?.disconnect();
      view?.removeEventListener("scroll", this.refreshViewportOrigin, true);
      view?.removeEventListener("resize", this.refreshViewportOrigin);
      this.cancelPointerSpotlight();
    };
  }
  /**
   * Caches the viewport's client origin so pointermove can avoid layout reads.
   *
   * @returns The cached client origin is refreshed when a viewport is mounted.
   */
  refreshViewportOrigin = (): void => {
    const root = this.viewport;
    if (!root) {
      return;
    }
    const bounds = root.getBoundingClientRect();
    this.viewportOrigin = { left: bounds.left, top: bounds.top };
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
   */
  updatePointerSpotlight = (event: ReactPointerEvent<HTMLElement>): void => {
    this.spotlightPoint = {
      x: event.clientX,
      y: event.clientY,
    };
    if (this.spotlightFrame !== null) {
      return;
    }
    this.spotlightFrame = requestAnimationFrame(() => {
      const root = this.viewport;
      const overlay = this.spotlightOverlay;
      this.spotlightFrame = null;
      if (!root || !overlay) {
        return;
      }
      if (root.dataset.transforming || root.dataset.panning === "true") {
        return;
      }
      overlay.style.setProperty(
        "--rivto-edgeless-pointer-x",
        `${this.spotlightPoint.x - this.viewportOrigin.left}px`,
      );
      overlay.style.setProperty(
        "--rivto-edgeless-pointer-y",
        `${this.spotlightPoint.y - this.viewportOrigin.top}px`,
      );
    });
  };

  /**
   * Cancels a pending pointer-spotlight animation frame.
   *
   * @returns Any scheduled spotlight paint is cancelled and its handle is cleared.
   */
  private cancelPointerSpotlight = (): void => {
    if (this.spotlightFrame === null) {
      return;
    }
    cancelAnimationFrame(this.spotlightFrame);
    this.spotlightFrame = null;
  };
}
