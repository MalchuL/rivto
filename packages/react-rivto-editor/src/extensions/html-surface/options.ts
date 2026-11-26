/**
 * Host-configurable limits of the HTML surface extension.
 *
 * @module
 */

/** Options accepted by `htmlSurfaceExtension`. Omitted fields use {@link DEFAULT_HTML_SURFACE_LIMITS}. */
export interface HtmlSurfaceOptions {
  /** Quiet time after the last draft edit before refreshing Preview, in milliseconds. Defaults to 400. */
  readonly previewDelayMs?: number;
  /**
   * Maximum height of an auto-sized Page block iframe, in CSS pixels.
   *
   * A Page block grows with the height its widget reports; past this height the
   * widget scrolls inside its frame. The bound keeps a buggy or hostile widget,
   * or layout that depends on the iframe's own height, from growing without limit.
   * Canvas elements fill their element frame and ignore it. Must be positive and finite.
   */
  readonly maxBlockHeight?: number;
  /**
   * Maximum number of editor pointer regions one widget document may report.
   *
   * The editor lays one transparent target per region. The page script stops at this
   * count, and the editor rejects a longer list outright, so a widget
   * cannot make the editor render an unbounded number of overlays. A widget whose
   * automatic regions exceed it loses the remainder and can mark explicit
   * `data-rivto-drag-handle` regions instead. Must be a positive integer.
   */
  readonly maxEditorPointerRegions?: number;
}

/** Fully resolved limits shared by every occurrence of one installation. */
export type HtmlSurfaceLimits = Required<HtmlSurfaceOptions>;

/** Props through which a registration hands its installation's limits to a renderer. */
export interface HtmlSurfaceLimitsProps {
  /** Frame limits of the extension installation. */
  readonly limits: HtmlSurfaceLimits;
}

/** Limits used for options the host application leaves out. */
export const DEFAULT_HTML_SURFACE_LIMITS: HtmlSurfaceLimits = Object.freeze({
  previewDelayMs: 400,
  maxBlockHeight: 720,
  maxEditorPointerRegions: 64,
});

/**
 * Applies defaults to extension options and validates the result.
 *
 * @param options - Options passed by the host application; omitted fields take their defaults.
 * @returns Frozen limits for one installation.
 * @throws RangeError if `maxBlockHeight` is not a positive finite number or
 * `maxEditorPointerRegions` is not a positive integer, or the delay is outside the browser timer range.
 */
export function resolveHtmlSurfaceLimits(options: HtmlSurfaceOptions = {}): HtmlSurfaceLimits {
  const maxBlockHeight = options.maxBlockHeight ?? DEFAULT_HTML_SURFACE_LIMITS.maxBlockHeight;
  const maxEditorPointerRegions =
    options.maxEditorPointerRegions ?? DEFAULT_HTML_SURFACE_LIMITS.maxEditorPointerRegions;
  if (!Number.isFinite(maxBlockHeight) || maxBlockHeight <= 0) {
    throw new RangeError(`maxBlockHeight must be a positive finite number, got ${maxBlockHeight}`);
  }
  if (!Number.isInteger(maxEditorPointerRegions) || maxEditorPointerRegions <= 0) {
    throw new RangeError(
      `maxEditorPointerRegions must be a positive integer, got ${maxEditorPointerRegions}`,
    );
  }
  const previewDelayMs = options.previewDelayMs ?? DEFAULT_HTML_SURFACE_LIMITS.previewDelayMs;
  if (!Number.isInteger(previewDelayMs) || previewDelayMs < 0 || previewDelayMs > 2_147_483_647) {
    throw new RangeError("previewDelayMs must be an integer between 0 and 2147483647");
  }
  return Object.freeze({ maxBlockHeight, maxEditorPointerRegions, previewDelayMs });
}
