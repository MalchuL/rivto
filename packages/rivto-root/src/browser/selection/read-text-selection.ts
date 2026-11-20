import type { TextSelection, TextSelectionPosition, TextSelectionQuery } from "../../text/types";

/**
 * Reads directed browser selection endpoints within a mounted occurrence.
 *
 * Anchor and focus are converted separately so reverse selections retain their
 * direction. Nested occurrence boundaries and endpoints outside owned content
 * are excluded.
 *
 * @param root - Mounted browser occurrence owning the selection.
 * @param query - Selectors identifying content hosts, owners, and boundaries.
 * @returns Portable directed endpoints, or undefined when either cannot be resolved.
 * @throws Propagates browser selection access and selector failures.
 */
export function readBrowserTextSelection(
  root: HTMLElement,
  query: TextSelectionQuery,
): TextSelection | undefined {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) {
    return undefined;
  }
  const anchor = readTextPosition(root, selection.anchorNode, selection.anchorOffset, query);
  const focus = readTextPosition(root, selection.focusNode, selection.focusOffset, query);
  return anchor && focus ? { anchor, focus } : undefined;
}

/**
 * Converts one browser selection endpoint to its owner and flat text offset.
 *
 * React may replace text nodes while browser selection still points at an old
 * endpoint; a range rejected by the browser is treated as unavailable.
 *
 * @param root - Occurrence that must own the endpoint's content.
 * @param node - Native anchor or focus node, possibly absent.
 * @param offset - Browser offset within the endpoint node.
 * @param query - Selectors identifying the content, owner, and boundary.
 * @returns Owner identity and UTF-16 offset, or undefined for an unusable endpoint.
 * @throws Propagates selector and range creation failures.
 */
export function readTextPosition(
  root: HTMLElement,
  node: Node | null,
  offset: number,
  query: TextSelectionQuery,
): TextSelectionPosition | undefined {
  const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
  const content = element?.closest(query.contentSelector);
  const ownerId = content?.closest(query.ownerSelector)?.getAttribute(query.ownerAttribute);
  if (!node || !content || !ownerId || !root.contains(content)) {
    return undefined;
  }
  if (content.closest(query.boundarySelector) !== root) {
    return undefined;
  }
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(content);
  try {
    range.setEnd(node, offset);
  } catch {
    return undefined;
  }
  return { ownerId, offset: range.toString().length };
}
