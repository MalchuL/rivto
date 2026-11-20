import type { TextSelection, TextSelectionPosition, TextSelectionQuery } from "../../text/types";
import type { BrowserTextSelectionPoint } from "./types";

/**
 * Finds the first directly owned content host across matching rendered owners.
 *
 * Matching owners in nested occurrences and content owned by nested owners are
 * excluded. Later duplicate owners remain eligible when earlier ones lack content.
 *
 * @param root - Mounted occurrence to search.
 * @param query - Selectors identifying content, owners, and boundaries.
 * @param ownerId - Exact owner identity to find.
 * @returns First directly owned content host, or undefined when absent.
 * @throws Propagates browser selector failures.
 */
export function findSelectionContent(
  root: HTMLElement,
  query: TextSelectionQuery,
  ownerId: string,
): HTMLElement | undefined {
  for (const owner of findSelectionOwners(root, query, ownerId)) {
    for (const content of owner.querySelectorAll<HTMLElement>(query.contentSelector)) {
      if (
        content.closest(query.boundarySelector) === root &&
        content.closest(query.ownerSelector) === owner
      ) {
        return content;
      }
    }
  }
  return undefined;
}

/**
 * Restores a directed browser range after resolving and optionally mounting its owners.
 *
 * Existing contentless owners are not mounted again. The moving endpoint receives
 * focus without scrolling. If the browser rejects directed selection, a normalized
 * Range is used as a paint fallback without changing the model's direction.
 *
 * @param root - Mounted occurrence owning both endpoints.
 * @param query - Selectors identifying content, owners, and boundaries.
 * @param selection - Directed owner identities and UTF-16 offsets.
 * @param mountMissing - Requests synchronous mounting of an absent owner.
 * @param isActive - Checks the originating caller and Root attachment.
 * @returns False when an endpoint or attachment is unavailable; otherwise restoration was requested.
 * @throws Propagates mounting, selector, focus, and browser range failures.
 */
export function restoreBrowserTextSelection(
  root: HTMLElement,
  query: TextSelectionQuery,
  selection: TextSelection,
  mountMissing: (ownerId: string) => void,
  isActive: () => boolean,
): boolean {
  const anchor = resolveBrowserTextPoint(root, query, selection.anchor, mountMissing, isActive);
  if (!anchor || !isActive()) {
    return false;
  }
  const focus = resolveBrowserTextPoint(root, query, selection.focus, mountMissing, isActive);
  if (!focus || !isActive()) {
    return false;
  }
  focus.content.focus({ preventScroll: true });
  if (!isActive()) {
    return false;
  }
  setBrowserTextSelection(anchor, focus);
  return true;
}

/**
 * Finds occurrence-owned shells matching one exact owner identity.
 *
 * @param root - Mounted occurrence to search.
 * @param query - Owner and boundary selectors.
 * @param ownerId - Exact owner identity.
 * @returns Matching shells in document order, excluding nested occurrences.
 * @throws Propagates browser selector failures.
 */
function findSelectionOwners(
  root: HTMLElement,
  query: TextSelectionQuery,
  ownerId: string,
): Element[] {
  const selector = `[${CSS.escape(query.ownerAttribute)}="${CSS.escape(ownerId)}"]`;
  return [...root.querySelectorAll(selector)].filter(
    (owner) => owner.matches(query.ownerSelector) && owner.closest(query.boundarySelector) === root,
  );
}

/**
 * Resolves one portable text position to its current live browser endpoint.
 *
 * Finds rendered content for the owner, then maps the flat text offset onto a
 * live Text or Element node. A virtual view may synchronously mount an absent
 * owner without scrolling. An already mounted structural owner without editable
 * content does not request another mount or retain an extra virtual root.
 *
 * @param root - Mounted occurrence owning the endpoint.
 * @param query - Content, owner, and boundary selectors.
 * @param position - Owner identity and requested flat text offset.
 * @param mountMissing - Requests synchronous mounting of an absent owner.
 * @param isActive - Checks the originating caller and Root attachment.
 * @returns Native point held only by the browser adapter, or undefined when unavailable.
 * @throws Propagates mounting, selector, and browser traversal failures.
 */
export function resolveBrowserTextPoint(
  root: HTMLElement,
  query: TextSelectionQuery,
  position: TextSelectionPosition,
  mountMissing: (ownerId: string) => void,
  isActive: () => boolean,
): BrowserTextSelectionPoint | undefined {
  if (!isActive()) {
    return undefined;
  }
  let content = findSelectionContent(root, query, position.ownerId);
  if (!content && !findSelectionOwners(root, query, position.ownerId).length) {
    mountMissing(position.ownerId);
    if (!isActive()) {
      return undefined;
    }
    content = findSelectionContent(root, query, position.ownerId);
  }
  if (!content || !isActive()) {
    return undefined;
  }
  const walker = root.ownerDocument.createTreeWalker(content, 4);
  let remaining = Math.max(0, position.offset);
  let last: Node | undefined;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    last = node;
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      return { node, offset: remaining, content };
    }
    remaining -= length;
  }
  return last
    ? { node: last, offset: last.textContent?.length ?? 0, content }
    : { node: content, offset: 0, content };
}

/**
 * Displays a directed native selection across separate contenteditable hosts.
 *
 * `Selection.setBaseAndExtent` preserves upward (bottom-to-top) direction. When
 * the browser rejects cross-host endpoints, a normalized Range still paints a
 * selection; the model-owned selection remains the source of truth for direction.
 *
 * @param anchor - Fixed browser endpoint.
 * @param focus - Moving browser endpoint.
 * @returns The browser selection is updated when available.
 * @throws Propagates failures in the fallback range and selection operations.
 */
export function setBrowserTextSelection(
  anchor: BrowserTextSelectionPoint,
  focus: BrowserTextSelectionPoint,
): void {
  const selection = anchor.content.ownerDocument.getSelection();
  if (!selection) {
    return;
  }
  try {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    return;
  } catch {
    // Browsers can reject directed selections across detached or separate hosts.
  }
  const anchorBeforeFocus =
    anchor.node === focus.node
      ? anchor.offset <= focus.offset
      : Boolean(anchor.node.compareDocumentPosition(focus.node) & Node.DOCUMENT_POSITION_FOLLOWING);
  const start = anchorBeforeFocus ? anchor : focus;
  const end = anchorBeforeFocus ? focus : anchor;
  const range = anchor.content.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}
