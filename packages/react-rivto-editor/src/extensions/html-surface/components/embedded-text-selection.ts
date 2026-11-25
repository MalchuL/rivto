import type { EmbeddedTextSelectionDetail } from "@chulane/rivto-page";

/**
 * Maps authenticated frame-local mouse positions to the containing Page occurrence.
 *
 * The SVG's screen matrix includes scrolling, zoom and rotated canvas ancestors.
 * Its origin coincides with the borderless iframe inside its positioned container.
 * Allocate it only after a native text drag leaves that frame.
 *
 * @param frame - Frame that supplied the private pointer report.
 * @param key - Credential captured by the native-input bootstrap.
 * @param signal - Connection lifetime, also used to cancel a disappearing origin.
 * @returns Handler reporting whether Page committed a range and the native text should be cleared.
 */
export function createEmbeddedTextSelectionHandler(
  frame: HTMLIFrameElement,
  key: string,
  signal: AbortSignal,
) {
  let origin: SVGSVGElement | undefined;
  const release = () => {
    origin?.remove();
    origin = undefined;
  };
  signal.addEventListener("abort", release, { once: true });
  return (data: unknown): boolean => {
    if (
      !data ||
      typeof data !== "object" ||
      !("selectionKey" in data) ||
      data.selectionKey !== key ||
      !("phase" in data) ||
      !("x" in data) ||
      !("y" in data)
    ) {
      return false;
    }
    const { phase, x, y } = data;
    if (
      (phase !== "move" && phase !== "end" && phase !== "cancel") ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return false;
    }
    if (!origin) {
      origin = frame.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
      origin.setAttribute("aria-hidden", "true");
      origin.style.cssText =
        "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden";
      frame.parentElement?.append(origin);
    }
    const matrix = origin.getScreenCTM();
    let committed = false;
    if (matrix) {
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      const detail: EmbeddedTextSelectionDetail = {
        phase,
        clientX: point.x,
        clientY: point.y,
        signal,
      };
      committed = !frame.dispatchEvent(
        new CustomEvent("rivto-embedded-text-selection", {
          bubbles: true,
          cancelable: true,
          detail,
        }),
      );
    }
    if (phase !== "move") {
      release();
    }
    return committed;
  };
}
