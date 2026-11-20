import type { CanvasApi } from "./canvas";
import type {
  CanvasMarqueeHit,
  CanvasMarqueeSource,
  CanvasMarqueeRegion,
  CanvasMarqueeRectangle,
} from "./types";
import type { Point } from "../types/canvas";
import { elementBounds, intersects } from "../utils/geometry";

/** Owns one marquee gesture and its occurrence-bound rectangle without React rendering. */
export class CanvasMarquee {
  private startPoint: Point | undefined;
  private base: readonly string[] = [];
  private hits: readonly CanvasMarqueeHit[] | undefined;

  /**
   * Takes ownership of a rectangle overlay and borrows host geometry and selection policy.
   *
   * The rectangle is shown only after a drag crosses slop. Destroy removes it;
   * ending a gesture hides it for reuse.
   *
   * @param rectangle - Occurrence-bound overlay owned by this controller until destruction.
   * @param source - Geometry capture and selection publication, without lifecycle ownership.
   */
  constructor(
    private readonly rectangle: CanvasMarqueeRectangle,
    private readonly source: CanvasMarqueeSource,
  ) {}

  /**
   * Captures all projected object IDs and viewport rects, including virtualized objects.
   *
   * Geometry comes from the scene, so no element DOM measurements are required.
   * The viewport origin is measured once for the captured gesture snapshot.
   *
   * @param root - Captured occurrence region whose client origin offsets projected geometry.
   * @param canvas - Borrowed full scene geometry and world-to-viewport conversion.
   * @returns Selectable hits in source order, or undefined when the region becomes inactive.
   * @throws Propagates region measurement, canvas reads and coordinate conversion failures.
   */
  static snapshot(
    root: CanvasMarqueeRegion,
    canvas: Pick<CanvasApi, "getElements" | "toViewport">,
  ): readonly CanvasMarqueeHit[] | undefined {
    const origin = root.readBounds();
    if (!origin) {
      return undefined;
    }
    const hits = canvas
      .getElements()
      .filter((element) => element.selectable !== false)
      .map((element) => {
        const bounds = elementBounds(element);
        const topLeft = canvas.toViewport(bounds);
        const bottomRight = canvas.toViewport({
          x: bounds.x + bounds.width,
          y: bounds.y + bounds.height,
        });
        return {
          id: element.id,
          rect: {
            x: origin.left + topLeft.x,
            y: origin.top + topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y,
          },
        };
      });
    return root.getIdentity() ? hits : undefined;
  }

  /**
   * Begins a possible marquee while retaining the modifier-selected base identities.
   *
   * @param x - Starting client X coordinate in CSS pixels.
   * @param y - Starting client Y coordinate in CSS pixels.
   * @param base - Existing selection to retain; copied for this gesture.
   * @returns Any previous gesture is hidden and replaced without reading geometry.
   * @throws Propagates overlay cleanup failures.
   */
  start(x: number, y: number, base: readonly string[]): void {
    this.stop();
    this.startPoint = { x, y };
    this.base = [...base];
  }

  /**
   * Updates the rectangle and selection after crossing three CSS pixels of slop.
   *
   * Object bounds are captured once per gesture. Later moves only intersect the
   * snapshot and publish selection; they do not measure DOM or reread scene geometry.
   * A detached occurrence or canceled gesture cannot publish a stale selection.
   *
   * @param x - Current client X coordinate in CSS pixels.
   * @param y - Current client Y coordinate in CSS pixels.
   * @returns Whether an active marquee consumed this sample.
   * @throws Propagates geometry capture, overlay, and host selection failures.
   */
  move(x: number, y: number): boolean {
    const start = this.startPoint;
    if (!start || (!this.hits && Math.hypot(x - start.x, y - start.y) < 3)) {
      return false;
    }
    const hits = this.hits ?? this.source.capture();
    if (!hits || this.startPoint !== start) {
      return false;
    }
    this.hits = hits;
    const rect = {
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    };
    if (!this.rectangle.update(rect) || this.startPoint !== start) {
      return false;
    }
    const ids = hits.filter((hit) => intersects(hit.rect, rect)).map((hit) => hit.id);
    if (!this.rectangle.isCurrent() || this.startPoint !== start) {
      return false;
    }
    this.source.select([...new Set([...this.base, ...ids])]);
    return true;
  }

  /**
   * Ends an in-progress marquee without claiming pointerup for other handlers.
   *
   * The persistent overlay is hidden without unmounting it. Captured geometry and
   * base selection are released so a later gesture starts from live host state.
   *
   * @returns False so later input listeners may still receive the event.
   * @throws Propagates overlay update failures.
   */
  stop = (): false => {
    this.startPoint = undefined;
    this.hits = undefined;
    this.base = [];
    this.rectangle.update();
    return false;
  };

  /**
   * Cancels the gesture and removes its owned overlay, even if hiding it fails.
   *
   * @returns No gesture data or mounted rectangle remains; repeated cleanup is harmless.
   * @throws AggregateError if overlay hiding or removal fails.
   */
  destroy(): void {
    const errors: unknown[] = [];
    for (const cleanup of [this.stop, () => this.rectangle.remove()]) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Marquee cleanup failed");
    }
  }
}
