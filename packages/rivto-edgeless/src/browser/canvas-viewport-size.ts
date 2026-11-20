import type { InputRegion } from "@chulane/rivto-root";
import type { CanvasApi } from "../core/canvas";
import { canvasViewportAttachment } from "./canvas-viewport-attachment";
import type { CanvasViewport } from "./canvas-viewport";
import type { CanvasViewportLayers } from "./types";

/**
 * Observes the mounted viewport through its exact occurrence's Root.
 *
 * Attachment replacement releases the previous region observation. Initial
 * measurement and observer setup may synchronously replace the attachment.
 *
 * @param canvas - Scene receiving viewport dimensions in CSS pixels.
 * @param viewport - Owner publishing the current mounted occurrence.
 * @returns Idempotent cleanup for the subscription and current size observer.
 * @throws Propagates observation, measurement, and cleanup failures.
 */
export function observeCanvasViewportSize(
  canvas: Pick<CanvasApi, "setViewport">,
  viewport: CanvasViewport,
): () => void {
  return new CanvasViewportSizeObservation(canvas, viewport).start();
}

/** Owns the size observer associated with a viewport's current attachment. */
class CanvasViewportSizeObservation {
  private readonly attachments;
  private active = true;
  private revision = 0;
  private releaseSize: (() => void) | undefined;

  /**
   * Borrows the scene and viewport attachment store without owning either.
   *
   * @param canvas - Scene receiving measured dimensions.
   * @param viewport - Owner publishing mounted occurrence changes.
   */
  constructor(
    private readonly canvas: Pick<CanvasApi, "setViewport">,
    viewport: CanvasViewport,
  ) {
    this.attachments = canvasViewportAttachment(viewport);
  }

  /**
   * Subscribes to attachment changes and measures the current occurrence.
   *
   * @returns Idempotent cleanup for this subscription and size observer.
   * @throws Propagates setup failures and aggregates a failed rollback.
   */
  start(): () => void {
    const unsubscribe = this.attachments.subscribe(this.reconcile);
    try {
      this.reconcile();
    } catch (error) {
      try {
        this.dispose(unsubscribe);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Viewport size observation setup failed");
      }
      throw error;
    }
    return () => this.dispose(unsubscribe);
  }

  /**
   * Replaces the region observer when the mounted occurrence changes.
   *
   * @returns Only the latest current attachment retains an observer.
   * @throws Propagates Root capture, measurement, observer setup, or cleanup failures.
   */
  private readonly reconcile = (): void => {
    const sequence = ++this.revision;
    const previous = this.releaseSize;
    this.releaseSize = undefined;
    previous?.();
    if (!this.active || this.revision !== sequence) {
      return;
    }
    const layers = this.attachments.get();
    if (!layers?.coordinates.isAttached()) {
      return;
    }
    const current = () => this.isCurrent(layers, sequence);
    if (!current()) {
      return;
    }
    this.observeRegion(layers.rootRegion, current);
  };

  /**
   * Checks the exact attachment before and after its ownership callback.
   *
   * @param layers - Captured viewport attachment.
   * @param revision - Reconciliation sequence that acquired it.
   * @returns True only while the same active attachment remains published.
   * @throws Propagates attachment ownership failures.
   */
  private isCurrent(layers: Pick<CanvasViewportLayers, "coordinates">, revision: number): boolean {
    return (
      this.active &&
      this.revision === revision &&
      this.attachments.get() === layers &&
      layers.coordinates.isAttached() &&
      this.active &&
      this.revision === revision &&
      this.attachments.get() === layers
    );
  }

  /**
   * Measures and observes a region while its captured attachment remains current.
   *
   * @param region - Region captured from the mounted occurrence.
   * @param current - Checks the observation's exact attachment.
   * @returns A current observer is retained for later cleanup.
   * @throws Propagates measurement, scene update, setup, and stale cleanup failures.
   */
  private observeRegion(
    region: Pick<InputRegion, "readClientSize" | "observeSize">,
    current: () => boolean,
  ): void {
    /**
     * Publishes the current size only while the attachment is still current.
     *
     * @returns The scene receives available client dimensions.
     * @throws Propagates region measurement and scene update failures.
     */
    const measure = () => {
      const size = region.readClientSize();
      if (size && current()) {
        this.canvas.setViewport(size.width, size.height);
      }
    };
    measure();
    if (!current()) {
      return;
    }
    const release = region.observeSize(measure);
    if (current()) {
      this.releaseSize = release;
    } else {
      release();
    }
  }

  /**
   * Withdraws the observation before releasing its subscription and browser observer.
   *
   * @param unsubscribe - Releases the viewport attachment subscription.
   * @returns This observation cannot publish further dimensions.
   * @throws Propagates size observer cleanup failures.
   */
  private dispose(unsubscribe: () => void): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.revision += 1;
    const release = this.releaseSize;
    this.releaseSize = undefined;
    unsubscribe();
    release?.();
  }
}
