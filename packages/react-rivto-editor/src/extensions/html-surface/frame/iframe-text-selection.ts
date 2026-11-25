/**
 * Editor side of the text-selection relay: lets a text selection that starts
 * inside an HTML block continue into the neighboring Page blocks.
 *
 * The page side (`sandbox/runtime/text-selection-runtime.ts`) reports the
 * pointer position once a selection drag leaves the iframe. This module turns
 * that position into editor coordinates and hands it to Page as an
 * {@link IFRAME_TEXT_SELECTION_EVENT}; Page decides which blocks to select.
 *
 * @module
 */
import { IFRAME_TEXT_SELECTION_EVENT, type IframeTextSelectionDetail } from "@chulane/rivto-page";

/** A validated report from the page, in iframe viewport coordinates. */
interface TextSelectionReport {
  /** `move` while dragging, `end` on release, `cancel` when the drag was abandoned. */
  readonly phase: IframeTextSelectionDetail["phase"];
  /** Pointer x inside the iframe viewport, in CSS pixels. May be outside the viewport. */
  readonly x: number;
  /** Pointer y inside the iframe viewport, in CSS pixels. May be outside the viewport. */
  readonly y: number;
}

/** The relay for one iframe and one connected page. */
export interface IframeTextSelectionRelay {
  /**
   * Tells whether a port message is a text-selection report rather than a bridge message.
   *
   * @param data - Raw port message.
   * @returns True for any message with a `selectionKey` field, valid or not.
   */
  isReport(data: unknown): boolean;
  /**
   * Validates a report and passes it to Page in editor coordinates.
   *
   * @param data - Raw port message with a `selectionKey` field.
   * @returns True when Page turned the drag into a block selection, in which case
   * the widget should clear its own text highlight.
   */
  relay(data: unknown): boolean;
}

/**
 * Creates the text-selection relay for one connected page.
 *
 * Converting iframe coordinates to editor coordinates must account for
 * scrolling, zoom and rotated canvas ancestors. Rather than computing that by
 * hand, the relay places a hidden 1×1 SVG at the iframe's top-left corner and
 * uses its screen transformation matrix. The SVG is created only when a drag
 * actually leaves the iframe, and removed when the drag ends or the page
 * disconnects.
 *
 * @param frame - The iframe that sends the reports. Page receives the event from it.
 * @param key - Secret the page uses to authenticate its reports.
 * @param signal - Aborted when the page disconnects; also passed on to Page.
 * @returns The relay.
 */
export function createIframeTextSelectionRelay(
  frame: HTMLIFrameElement,
  key: string,
  signal: AbortSignal,
): IframeTextSelectionRelay {
  const origin = createLazyOriginMarker(frame);
  signal.addEventListener("abort", origin.remove, { once: true });
  return {
    isReport: (data) => typeof data === "object" && data !== null && "selectionKey" in data,
    /**
     * Validates a report and dispatches it to Page in editor coordinates.
     *
     * @param data - Raw port message with a `selectionKey` field.
     * @returns True when Page turned the drag into a block selection.
     */
    relay(data) {
      const report = parseReport(data, key);
      if (!report) {
        return false;
      }
      const committed = dispatchToPage(frame, origin.get(), report, signal);
      if (report.phase !== "move") {
        origin.remove();
      }
      return committed;
    },
  };
}

/**
 * Converts a report to editor coordinates and dispatches it from the iframe.
 *
 * @param frame - The iframe the event is dispatched on; it bubbles to Page.
 * @param origin - Hidden marker at the iframe's top-left corner.
 * @param report - The validated report.
 * @param signal - Page cancels the selection when this aborts.
 * @returns True when Page handled the event (it calls `preventDefault` when it
 * commits a block selection); false if the position could not be converted.
 */
function dispatchToPage(
  frame: HTMLIFrameElement,
  origin: SVGSVGElement,
  report: TextSelectionReport,
  signal: AbortSignal,
): boolean {
  const matrix = origin.getScreenCTM();
  if (!matrix) {
    return false;
  }
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
  return !frame.dispatchEvent(event);
}

/**
 * Manages the hidden SVG used to map iframe coordinates to editor coordinates.
 *
 * @param frame - The iframe; the marker is added to its (positioned) parent.
 * @returns `get` creates the marker on first use and returns it; `remove`
 * deletes it. Both may be called any number of times.
 */
function createLazyOriginMarker(frame: HTMLIFrameElement) {
  let marker: SVGSVGElement | undefined;
  return {
    /**
     * Returns the marker, creating it on first use.
     *
     * @returns The marker element, attached to the iframe's parent.
     */
    get(): SVGSVGElement {
      if (!marker) {
        marker = frame.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
        marker.setAttribute("aria-hidden", "true");
        marker.style.cssText =
          "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden";
        frame.parentElement?.append(marker);
      }
      return marker;
    },
    /**
     * Removes the marker if it exists.
     *
     * @returns Nothing. The next `get` creates a new marker.
     */
    remove(): void {
      marker?.remove();
      marker = undefined;
    },
  };
}

/**
 * Validates an untrusted text-selection report.
 *
 * @param data - Raw port message.
 * @param key - The secret the report must carry.
 * @returns The report, or undefined when the key is wrong or any field is malformed.
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
