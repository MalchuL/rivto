import type { CanvasOptions, Rect } from "../types/canvas";
import type { CanvasToolSession } from "../types/tool-session";
import type { CanvasSource } from "./canvas-source";

/** Explicit dependencies of one independent edgeless editing session. */
export interface CanvasEditorOptions<
  Tools extends CanvasToolSession,
  Source extends CanvasSource = CanvasSource,
> {
  readonly source: Source;
  readonly tools: Tools;
  readonly canvas?: CanvasOptions;
}

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
   * @returns Client-coordinate hits, or undefined when the occurrence is unavailable.
   * IDs may already resolve to host selection groups.
   * @throws Propagates host geometry and ownership failures.
   */
  capture(): readonly CanvasMarqueeHit[] | undefined;
  /**
   * Publishes the captured base selection and current intersecting identities.
   *
   * @param ids - Deduplicated selected IDs in base-then-hit order.
   * @returns The host has received the current selection request.
   * @throws Propagates selection publication failures.
   */
  select(ids: readonly string[]): void;
}

/** Viewport geometry borrowed for the duration of a marquee gesture. */
export interface CanvasMarqueeRegion {
  /**
   * Reads this occurrence's client-coordinate bounds.
   *
   * @returns Viewport origin, or undefined after the occurrence becomes inactive.
   */
  readBounds(): { readonly left: number; readonly top: number } | undefined;
  /**
   * Checks whether the captured occurrence remains active.
   *
   * @returns Its identity, or undefined after it becomes inactive.
   */
  getIdentity(): object | undefined;
}

/** Rectangle owned by a marquee until the controller is destroyed. */
export interface CanvasMarqueeRectangle {
  /**
   * Checks whether the rectangle still belongs to its captured occurrence.
   *
   * @returns False when the occurrence or rectangle is no longer current.
   */
  isCurrent(): boolean;
  /**
   * Shows the rectangle at client coordinates or hides it.
   *
   * @param position - Bounds in CSS pixels, or undefined to hide the rectangle.
   * @returns Whether the current occurrence accepted the update.
   */
  update(position?: Rect): boolean;
  /**
   * Removes the rectangle even after its occurrence detaches.
   *
   * @returns The owned rectangle has been released.
   */
  remove(): void;
}
