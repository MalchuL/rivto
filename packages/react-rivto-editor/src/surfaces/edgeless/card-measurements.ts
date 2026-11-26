import type { CanvasApi } from "@chulane/rivto-edgeless";
import { flushSync } from "react-dom";

/** Geometry reads, camera notifications and temporary mounts borrowed from the scene. */
export type CardMeasurementCanvas = Pick<
  CanvasApi,
  "visible" | "pin" | "getElement" | "toWorld" | "camera"
>;

/** Measures stale auto-height cards through their ordinary mounted renderer. */
export class CardMeasurements {
  private readonly pending = new Set<string>();
  private size?: { width: number; height: number };
  private frame?: number;
  private unpin?: () => void;

  /**
   * Associates the queue with the scene whose visible cards can measure themselves.
   *
   * @param canvas - Borrowed projection, camera and temporary mount operations.
   */
  constructor(private readonly canvas: CardMeasurementCanvas) {}

  /**
   * Schedules measurement after input and observes changes to the viewport.
   *
   * @param viewport - Mounted canvas root supplying the local CSS dimensions.
   * @returns Cleanup releasing the observer, camera subscription, frame and active pins.
   */
  connect(viewport: HTMLElement): () => void {
    /**
     * Captures local CSS dimensions so camera frames can use them without reading layout.
     *
     * @returns Reschedules pending cards after a viewport resize.
     */
    const resize = () => {
      this.size = { width: viewport.clientWidth, height: viewport.clientHeight };
      this.schedule();
    };
    const stop = this.canvas.camera.subscribe(this.schedule);
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    return () => {
      this.size = undefined;
      stop();
      observer.disconnect();
      if (this.frame !== undefined) {
        cancelAnimationFrame(this.frame);
        this.frame = undefined;
      }
      this.unpin?.();
      this.unpin = undefined;
    };
  }

  /**
   * Marks the card's stored bounds as potentially stale after a layout input changes.
   *
   * @param id - Auto-height card whose renderer can supply a fresh measurement.
   * @returns Coalesces repeated changes before the next frame.
   */
  invalidate(id: string): void {
    this.pending.add(id);
    this.schedule();
  }

  /**
   * Drops a removed card or a card that no longer uses content height.
   *
   * @param id - Identity leaving measurement observation.
   * @returns Removes any outstanding request for this identity.
   */
  remove(id: string): void {
    this.pending.delete(id);
  }

  /**
   * Coalesces camera and document notifications into one frame of measurement work.
   *
   * @returns Queues a frame only while a connected view has outstanding work.
   */
  private schedule = (): void => {
    if (this.size && this.frame === undefined && (this.pending.size || this.unpin)) {
      this.frame = requestAnimationFrame(this.measure);
    }
  };

  /**
   * Mounts at most two stale candidates whose expanded content could reach the viewport.
   *
   * An upright auto-height card grows down from its stored top. Rotation can move
   * every edge, so rotated cards always qualify. Layout effects run in the pinned
   * commit and their batched height writes finish before the next frame releases it.
   *
   * @returns Updates temporary mounts using the latest camera and viewport size.
   */
  private measure = (): void => {
    this.frame = undefined;
    this.unpin?.();
    this.unpin = undefined;
    const size = this.size;
    if (!size) {
      return;
    }
    const start = this.canvas.toWorld({ x: 0, y: 0 });
    const end = this.canvas.toWorld({ x: size.width, y: size.height });
    const mounted = new Set(this.canvas.visible.get());
    const batch: string[] = [];
    for (const id of this.pending) {
      const card = this.canvas.getElement(id);
      if (!card || mounted.has(id)) {
        this.pending.delete(id);
        continue;
      }
      // An offscreen edit can extend the card below its stored bottom. Testing
      // that edge here would keep the card unmounted when the camera lands on
      // the new content, so the renderer would never get to measure it.
      const { x, y, width } = card.frame;
      if (!card.rotation && (x + width < start.x || x > end.x || y > end.y)) {
        continue;
      }
      this.pending.delete(id);
      batch.push(id);
      if (batch.length === 2) {
        break;
      }
    }
    if (batch.length) {
      flushSync(() => {
        this.unpin = this.canvas.pin(batch);
      });
      this.schedule();
    }
  };
}
