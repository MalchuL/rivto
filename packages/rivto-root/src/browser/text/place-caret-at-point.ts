import type { BrowserTextPosition } from "./types";

/**
 * Places a collapsed caret inside an element nearest to viewport coordinates.
 *
 * Used when a host becomes `contentEditable` only after the activating click
 * (for example double-click-to-edit labels). Native focus then lands at offset
 * 0; this helper restores the character under the pointer.
 *
 * @param element - Focusable editable host that already contains the text nodes.
 * @param clientX - Pointer X in viewport pixels.
 * @param clientY - Pointer Y in viewport pixels.
 * @param isCurrent - Checks the exact region and occurrence before changing selection.
 * @returns True when the requested caret was placed; false when ownership ends,
 * selection is unavailable, or the browser needed the collapsed-start fallback.
 * @throws Propagates browser focus, geometry, range, and ownership-check failures.
 */
export function placeCaretAtPoint(
  element: HTMLElement,
  clientX: number,
  clientY: number,
  isCurrent: () => boolean,
): boolean {
  const document = element.ownerDocument;
  if (!isCurrent()) {
    return false;
  }
  element.focus({ preventScroll: true });
  if (!isCurrent()) {
    return false;
  }
  const selection = document.getSelection();
  if (!selection) {
    return false;
  }

  const caret = document.caretPositionFromPoint?.(clientX, clientY);
  const rangeHit = (
    document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  ).caretRangeFromPoint?.(clientX, clientY);
  let node: Node | null = caret?.offsetNode ?? rangeHit?.startContainer ?? null;
  let offset = caret?.offset ?? rangeHit?.startOffset ?? 0;

  if (!node || !element.contains(node)) {
    const nearest = nearestTextPoint(element, clientX, clientY);
    node = nearest.node;
    offset = nearest.offset;
  }

  if (!isCurrent()) {
    return false;
  }
  let placed = false;
  try {
    selection.setBaseAndExtent(node, offset, node, offset);
    placed = true;
  } catch {
    if (!isCurrent()) {
      return false;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return isCurrent() && placed;
}

/**
 * Scans text nodes in `element` for the caret closest to `(x, y)`.
 *
 * @param element - Host whose descendant text positions are measured.
 * @param x - Horizontal viewport coordinate in CSS pixels.
 * @param y - Vertical viewport coordinate in CSS pixels.
 * @returns The nearest position, or the host start when it contains no text nodes.
 * @throws Propagates browser range and geometry failures.
 */
function nearestTextPoint(element: HTMLElement, x: number, y: number): BrowserTextPosition {
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let best: BrowserTextPosition | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (let offset = 0; offset <= text.length; offset += 1) {
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      const distance = Math.hypot(x - rect.left, y - (rect.top + rect.height / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { node, offset };
      }
    }
  }

  return best ?? { node: element, offset: 0 };
}
