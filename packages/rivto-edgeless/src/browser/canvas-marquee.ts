import type { CanvasApi } from "../core/canvas";
import type { Rect } from "../types/canvas";
import { elementBounds, intersects } from "../utils/geometry";

/** One selectable identity and its captured client-coordinate bounds. */
export interface CanvasMarqueeHit {
  readonly id: string;
  readonly rect: Rect;
}

/** Host policy borrowed by the marquee; persisted selection stays with the host. */
export interface CanvasMarqueeSource {
  /**
   * Captures selectable geometry when the pointer first crosses the drag threshold.
   *
   * @returns Client-coordinate hits; IDs may already resolve to host selection groups.
   */
  capture(): readonly CanvasMarqueeHit[];
  /**
   * Publishes the captured base selection and current intersecting identities.
   *
   * @param ids - Deduplicated selected IDs in base-then-hit order.
   * @returns The host has received the current selection request.
   */
  select(ids: readonly string[]): void;
}

/** Owns one marquee gesture and its imperative DOM rectangle without React rendering. */
export class CanvasMarquee {
  private startPoint: { x: number; y: number } | undefined;
  private base: readonly string[] = [];
  private hits: readonly CanvasMarqueeHit[] | undefined;

  /**
   * Takes ownership of a detached rectangle and borrows host geometry/selection policy.
   *
   * The rectangle is appended to its owner document only after a drag crosses slop.
   * Destroy removes it; ending a gesture hides it for reuse.
   *
   * @param rectangle - Host-styled overlay node owned by this controller until destruction.
   * @param source - Geometry capture and selection publication, without lifecycle ownership.
   */
  constructor(
    private readonly rectangle: HTMLElement,
    private readonly source: CanvasMarqueeSource,
  ) {}

  /**
   * Captures all projected object IDs and viewport rects, including virtualized objects.
   *
   * Geometry comes from the scene, so no element DOM measurements are required.
   * The viewport origin is measured once for the captured gesture snapshot.
   *
   * @param root - Canvas viewport whose client origin offsets projected geometry.
   * @param canvas - Borrowed full scene geometry and world-to-viewport conversion.
   * @returns Selectable hits in source order, including offscreen objects.
   */
  static snapshot(
    root: HTMLElement,
    canvas: Pick<CanvasApi, "getElements" | "toViewport">,
  ): readonly CanvasMarqueeHit[] {
    const origin = root.getBoundingClientRect();
    return canvas
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
  }

  /**
   * Begins a possible marquee while retaining the modifier-selected base identities.
   *
   * @param x - Starting client X coordinate in CSS pixels.
   * @param y - Starting client Y coordinate in CSS pixels.
   * @param base - Existing selection to retain; copied for this gesture.
   * @returns Any previous gesture is hidden and replaced without reading geometry.
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
   *
   * @param x - Current client X coordinate in CSS pixels.
   * @param y - Current client Y coordinate in CSS pixels.
   * @returns Whether an active marquee consumed this sample.
   * @throws Propagates geometry capture, DOM writes, and host selection failures.
   */
  move(x: number, y: number): boolean {
    const start = this.startPoint;
    if (!start || (!this.hits && Math.hypot(x - start.x, y - start.y) < 3)) {
      return false;
    }
    this.hits ??= this.source.capture();
    const rect = {
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    };
    this.paintRectangle(rect);
    const ids = this.hits.filter((hit) => intersects(hit.rect, rect)).map((hit) => hit.id);
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
   */
  stop = (): false => {
    this.startPoint = undefined;
    this.hits = undefined;
    this.base = [];
    this.rectangle.style.display = "none";
    return false;
  };

  /**
   * Cancels the gesture and removes its owned overlay node from the document.
   *
   * @returns No gesture data or mounted rectangle remains; repeated cleanup is harmless.
   */
  destroy(): void {
    this.stop();
    this.rectangle.remove();
  }

  /**
   * Creates or reuses the persistent marquee node on its owner document's body and paints it.
   *
   * @param rect - Inclusive client rectangle for the current pointer sample.
   * @returns The overlay is mounted and its geometry matches the sample.
   */
  private paintRectangle(rect: Rect): void {
    const node = this.rectangle;
    if (!node.isConnected) {
      node.ownerDocument.body.appendChild(node);
    }
    node.style.display = "block";
    node.style.left = `${rect.x}px`;
    node.style.top = `${rect.y}px`;
    node.style.width = `${rect.width}px`;
    node.style.height = `${rect.height}px`;
  }
}
