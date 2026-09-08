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
 * @returns True when a caret was placed inside `element`.
 */
export function placeCaretAtPoint(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): boolean {
  const document = element.ownerDocument;
  element.focus({ preventScroll: true });
  const selection = document.getSelection();
  if (!selection) return false;

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

  let placed = false;
  try {
    selection.setBaseAndExtent(node, offset, node, offset);
    placed = true;
  } catch {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return placed;
}

/** Scans text nodes in `element` for the caret closest to `(x, y)`. */
function nearestTextPoint(
  element: HTMLElement,
  x: number,
  y: number,
): { node: Node; offset: number } {
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let best: { node: Node; offset: number } | undefined;
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
