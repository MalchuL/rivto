/**
 * Plain-text read/write helpers for editable visual labels.
 *
 * A `contentEditable` host turns Enter into `insertParagraph` / `insertLineBreak`
 * (`<div>` or `<br>`). `Node.textContent` concatenates descendant text and drops
 * those breaks, so connector labels (which use `white-space: pre` and do not
 * wrap) looked like Enter was ignored. These helpers insert a real `\n` and
 * read the rendered plain text, including line breaks.
 */

/**
 * Reads the visible plain text of a label host, preserving Enter as `\n`.
 *
 * `innerText` maps `<br>` and block splits to newlines. `textContent` is only
 * a fallback for engines that do not implement `innerText`.
 *
 * @param element - Label host whose DOM may contain text nodes, `<br>`, or blocks.
 * @returns Normalized plain text with `\n` line breaks.
 */
export function readEditablePlainText(element: HTMLElement): string {
  const rendered =
    typeof element.innerText === "string" ? element.innerText : (element.textContent ?? "");
  return rendered.replace(/\r\n?/g, "\n");
}

/**
 * Inserts plain text at the current caret, replacing any selected range.
 *
 * Prefer `insertText` so the browser keeps native caret/undo behavior. Fall
 * back to a text node when `execCommand` cannot insert. Recheck ownership before
 * fallback mutations and reject a selection outside the captured host.
 *
 * @param element - Focused contenteditable label host.
 * @param text - Characters to insert, including `\n` line breaks.
 * @param isCurrent - Checks whether the original Root still owns the host.
 * @returns True for empty input, or while ownership, focus, and selection remain with the host.
 * @throws Propagates browser insertion and ownership-check failures.
 */
export function insertEditablePlainText(
  element: HTMLElement,
  text: string,
  isCurrent: () => boolean,
): boolean {
  if (!isCurrent()) {
    return false;
  }
  if (!text) {
    return true;
  }
  const document = element.ownerDocument;
  if (!element.contains(document.activeElement) || !isCurrent()) {
    return false;
  }
  const selection = document.getSelection();
  if (
    !selectionBelongsToHost(selection, element) ||
    !element.contains(document.activeElement) ||
    !isCurrent()
  ) {
    return false;
  }
  if (document.execCommand("insertText", false, text)) {
    return isCurrent() && element.contains(document.activeElement);
  }
  if (
    !isCurrent() ||
    !element.contains(document.activeElement) ||
    !selection ||
    !selectionBelongsToHost(selection, element)
  ) {
    return false;
  }
  selection.deleteFromDocument();
  if (
    !isCurrent() ||
    !element.contains(document.activeElement) ||
    !selectionBelongsToHost(selection, element)
  ) {
    return false;
  }
  if (selection.rangeCount === 0) {
    const seed = document.createRange();
    seed.selectNodeContents(element);
    seed.collapse(false);
    selection.addRange(seed);
  }
  const range = selection.getRangeAt(0);
  const node = document.createTextNode(text);
  range.insertNode(node);
  if (!isCurrent()) {
    return false;
  }
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return isCurrent() && element.contains(document.activeElement);
}

/**
 * Checks whether a browser selection is empty or remains inside the editable.
 *
 * @param selection - Current document selection, absent when unavailable.
 * @param element - Captured editable that owns eligible endpoints.
 * @returns False when either endpoint of a non-empty selection is outside the host.
 */
function selectionBelongsToHost(selection: Selection | null, element: HTMLElement): boolean {
  return (
    !selection?.rangeCount ||
    (element.contains(selection.anchorNode) && element.contains(selection.focusNode))
  );
}
