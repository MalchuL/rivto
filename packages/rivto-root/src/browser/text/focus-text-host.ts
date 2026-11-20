import type { TextHostFocusResult, TextHostQuery } from "../../text/types";

/**
 * Finds and focuses the first matching owner's directly owned content.
 *
 * Nested occurrences and content belonging to another owner are excluded. The
 * first owned shell determines whether content is missing even if a later shell
 * has the same identity. The caller's attachment is checked after browser reads
 * and after focus, which may synchronously detach or replace it.
 *
 * @param root - Browser surface owned by the originating Root.
 * @param query - Owner identity and selectors for its directly owned content.
 * @param offset - Requested UTF-16 offset within the content.
 * @param isActive - Checks the caller's attachment and Root lifetime.
 * @returns Focus outcome or the missing owner, content, or attachment.
 * @throws Propagates selector, attachment, focus, and range failures.
 */
export function focusBrowserTextHost(
  root: HTMLElement,
  query: TextHostQuery,
  offset: number,
  isActive: () => boolean,
): TextHostFocusResult {
  if (!isActive()) {
    return "detached";
  }
  const selector = `[${CSS.escape(query.ownerAttribute)}="${CSS.escape(query.ownerValue)}"]`;
  const owner = [...root.querySelectorAll<HTMLElement>(selector)].find(
    (candidate) =>
      candidate.matches(query.ownerSelector) &&
      root.contains(candidate) &&
      candidate.closest(query.boundarySelector) === root,
  );
  if (!isActive()) {
    return "detached";
  }
  if (!owner) {
    return "owner-missing";
  }
  const content = [...owner.querySelectorAll<HTMLElement>(query.contentSelector)].find(
    (candidate) =>
      root.contains(candidate) &&
      candidate.closest(query.boundarySelector) === root &&
      candidate.closest(query.ownerSelector) === owner,
  );
  if (!isActive()) {
    return "detached";
  }
  if (!content) {
    return "content-missing";
  }
  focusBrowserTextContent(content, offset, isActive);
  return isActive() ? "focused" : "detached";
}

/**
 * Focuses mounted editable content and places a collapsed native caret.
 *
 * Focus retains the browser's default scrolling behavior. UTF-16 offsets are
 * clamped through text-node traversal; past-end requests and empty content
 * collapse at the end of the content element, including trailing markup. This
 * changes browser selection only, without writing model selection or mounting.
 *
 * @param content - Editable host already resolved within the caller's occurrence.
 * @param offset - Requested flat UTF-16 offset; negative values clamp to zero.
 * @param isActive - Checks that the originating occurrence still owns the content after focus.
 * @returns Content is focused and its native caret placed when Selection is available.
 * @throws Propagates browser focus and Range failures.
 */
export function focusBrowserTextContent(
  content: HTMLElement,
  offset: number,
  isActive: () => boolean,
): void {
  content.focus();
  if (!isActive()) {
    return;
  }
  const selection = content.ownerDocument.getSelection();
  if (!selection) {
    return;
  }
  const walker = content.ownerDocument.createTreeWalker(content, 4);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();
  let last: Node | null = null;
  while (node && !(remaining <= (node.textContent?.length ?? 0))) {
    last = node;
    remaining -= node.textContent?.length ?? 0;
    node = walker.nextNode();
  }
  const range = content.ownerDocument.createRange();
  if (offset > (content.textContent?.length ?? 0) || (!node && !last)) {
    range.selectNodeContents(content);
    range.collapse(false);
  } else if (node) {
    range.setStart(node, remaining);
    range.collapse(true);
  } else if (last) {
    range.setStart(last, last.textContent?.length ?? 0);
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}
