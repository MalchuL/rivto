import type { InputHit } from "@chulane/rivto-root";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

/**
 * Captures a connected test target through the document hit-testing capability.
 *
 * @param element - Connected element to return from the temporary hit test.
 * @returns An opaque hit owned by the caller.
 * @throws If the document or target is unavailable.
 */
export function captureTestInputHit(element: Element): InputHit {
  const document = element.ownerDocument;
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const root = new BrowserInputRoot(document.body);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => element,
  });
  try {
    const hit = root.captureDocument()?.captureHit(0, 0);
    if (!hit) {
      throw new Error("Cannot capture a test hit without a connected document");
    }
    return hit;
  } finally {
    root.detach();
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
}
