/**
 * Host side of the native text-selection relay (see `text-selection-runtime.ts`).
 *
 * @module
 */
import { IFRAME_TEXT_SELECTION_EVENT, type IframeTextSelectionDetail } from "@chulane/rivto-page";

/** A validated report from the iframe, in iframe viewport coordinates. */
interface TextSelectionReport {
  readonly phase: IframeTextSelectionDetail["phase"];
  readonly x: number;
  readonly y: number;
}

/** Relay bound to one iframe and one connected document realm. */
export interface IframeTextSelectionRelay {
  /**
   * Reports whether a port message belongs to the relay rather than the frame protocol.
   *
   * @param data - Raw port message.
   * @returns True for any message carrying a `selectionKey`, valid or not.
   */
  isReport(data: unknown): boolean;
  /**
   * Converts an authenticated report to parent coordinates and dispatches it to Page.
   *
   * @param data - Raw port message carrying a `selectionKey`.
   * @returns True when Page committed a block range, so the iframe should clear its native selection.
   */
  relay(data: unknown): boolean;
}

/**
 * Creates the relay for one connected document.
 *
 * Coordinates are mapped with the screen matrix of a hidden SVG placed at the
 * iframe's origin, which accounts for scrolling, zoom and rotated canvas
 * ancestors. The SVG is created lazily, only once a drag leaves the frame, and
 * removed when the gesture ends or `signal` aborts.
 *
 * @param frame - Iframe that sends the reports; Page receives the event from it.
 * @param key - Secret the iframe uses to authenticate reports.
 * @param signal - Lifetime of the document realm; forwarded to Page as well.
 * @returns The relay.
 */
export function createIframeTextSelectionRelay(
  frame: HTMLIFrameElement,
  key: string,
  signal: AbortSignal,
): IframeTextSelectionRelay {
  let origin: SVGSVGElement | undefined;
  const releaseOrigin = () => {
    origin?.remove();
    origin = undefined;
  };
  signal.addEventListener("abort", releaseOrigin, { once: true });
  const ensureOrigin = (): SVGSVGElement => {
    if (!origin) {
      origin = frame.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
      origin.setAttribute("aria-hidden", "true");
      origin.style.cssText =
        "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden";
      frame.parentElement?.append(origin);
    }
    return origin;
  };
  return {
    isReport: (data) => typeof data === "object" && data !== null && "selectionKey" in data,
    /**
     * Dispatches one authenticated report to Page in parent viewport coordinates.
     *
     * @param data - Raw port message carrying a `selectionKey`.
     * @returns True when Page committed a block range.
     */
    relay(data) {
      const report = parseReport(data, key);
      if (!report) {
        return false;
      }
      const matrix = ensureOrigin().getScreenCTM();
      let committed = false;
      if (matrix) {
        const point = new DOMPoint(report.x, report.y).matrixTransform(matrix);
        const detail: IframeTextSelectionDetail = {
          phase: report.phase,
          clientX: point.x,
          clientY: point.y,
          signal,
        };
        const event = new CustomEvent(IFRAME_TEXT_SELECTION_EVENT, {
          bubbles: true,
          cancelable: true,
          detail,
        });
        // Page calls preventDefault when it commits a range.
        committed = !frame.dispatchEvent(event);
      }
      if (report.phase !== "move") {
        releaseOrigin();
      }
      return committed;
    },
  };
}

/**
 * Validates an untrusted selection report.
 *
 * @param data - Raw port message.
 * @param key - Expected secret.
 * @returns The report, or undefined when the key or any field is wrong.
 */
function parseReport(data: unknown, key: string): TextSelectionReport | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const { selectionKey, phase, x, y } = data as Record<string, unknown>;
  if (
    selectionKey !== key ||
    (phase !== "move" && phase !== "end" && phase !== "cancel") ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return undefined;
  }
  return { phase, x, y };
}
