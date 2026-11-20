/** Coordinates in a region's local SVG coordinate system. */
export interface RegionPoint {
  readonly x: number;
  readonly y: number;
}

/** Untransformed inner dimensions in CSS pixels. */
export interface RegionSize {
  /** Inner width, including padding and excluding borders and scrollbars. */
  readonly width: number;
  /** Inner height, including padding and excluding borders and scrollbars. */
  readonly height: number;
}

/** Rectangle measured in viewport CSS pixels. */
export interface RegionBounds {
  /** Left edge in viewport CSS pixels. */
  readonly left: number;
  /** Top edge in viewport CSS pixels. */
  readonly top: number;
  /** Width in CSS pixels. */
  readonly width: number;
  /** Height in CSS pixels. */
  readonly height: number;
}

/**
 * Receives viewport bounds for an occurrence-owned region.
 *
 * @param bounds - Detached rectangle in viewport CSS pixels.
 * @returns The observer has processed the current measurement.
 */
export type RegionBoundsObserver = (bounds: RegionBounds) => void;

/** Detached viewport geometry and computed values for one mounted HTML region. */
export interface RegionLayout {
  readonly bounds: RegionBounds;
  /** Ratio between viewport width and untransformed local width, or one for zero width. */
  readonly scaleX: number;
  /** Ratio between viewport height and untransformed local height, or one for zero height. */
  readonly scaleY: number;
  /** Computed CSS direction. */
  readonly direction: string;
  /** Requested computed CSS properties, keyed by their exact names. */
  readonly properties: Readonly<Record<string, string>>;
}

/** Viewport geometry for one matching descendant region. */
export interface RegionViewportBounds {
  /** Exact value of the requested identifying attribute. */
  readonly value: string;
  /** Top edge in viewport CSS pixels. */
  readonly top: number;
  /** Bottom edge in viewport CSS pixels. */
  readonly bottom: number;
  /** Height in CSS pixels. */
  readonly height: number;
}

/** Matching region geometry and the viewport used to measure visibility. */
export interface RegionViewportSnapshot {
  /** Viewport height in CSS pixels, or zero when its window is unavailable. */
  readonly viewportHeight: number;
  /** Matching descendant regions in document order, including duplicate values. */
  readonly regions: readonly RegionViewportBounds[];
}

/** Relative adjustment of the scrolling element captured from one document. */
export interface DocumentScroll {
  /**
   * Adjusts the captured document's vertical scroll position.
   *
   * @param delta - Vertical change in CSS pixels; positive values scroll down.
   * @returns The captured scroll position is adjusted while its Root remains attached.
   * @throws Propagates browser scroll access and attachment-check failures.
   */
  adjustBy(delta: number): void;
}

/**
 * Receives vertical wheel movement in its browser-reported units.
 *
 * @param deltaY - Vertical wheel delta, without unit conversion.
 * @returns The consumer has observed the movement.
 */
export type WindowWheelObserver = (deltaY: number) => void;

/**
 * Runs work at a browser animation frame without exposing its window.
 *
 * @returns The consumer has finished its frame work.
 */
export type FrameCallback = () => void;

/** Frame timing and scheduling captured from one occurrence's window. */
export interface FrameClock {
  /**
   * Reads the captured window's monotonic clock.
   *
   * @returns Milliseconds on that clock, or undefined after detachment or a document move.
   * @throws Propagates browser clock access and attachment-check failures.
   */
  now(): number | undefined;
  /**
   * Requests one frame while the originating Root remains current.
   *
   * An accepted callback still runs if the Root later detaches unless its owner
   * cancels it, so the callback can release pending resources after rechecking
   * its own attachment. Cancellation remains available after detachment.
   *
   * @param callback - Work to invoke at the next browser animation frame.
   * @returns Idempotent frame cancellation, or undefined when the occurrence is no longer current.
   * @throws Propagates browser scheduling and attachment-check failures.
   */
  requestFrame(callback: FrameCallback): (() => void) | undefined;
}
