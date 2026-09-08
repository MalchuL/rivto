/**
 * Plain-text read/write helpers for {@link EditableLabel}.
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
  const rendered = typeof element.innerText === "string" ? element.innerText : (element.textContent ?? "");
  return rendered.replace(/\r\n?/g, "\n");
}

/**
 * Inserts plain text at the current caret, replacing any selected range.
 *
 * Prefer `insertText` so the browser keeps native caret/undo behavior. Fall
 * back to a text node when `execCommand` cannot insert.
 *
 * @param element - Focused contenteditable label host.
 * @param text - Characters to insert, including `\n` line breaks.
 * @returns No value.
 */
export function insertEditablePlainText(element: HTMLElement, text: string): void {
  if (!text) return;
  const document = element.ownerDocument;
  if (document.execCommand("insertText", false, text)) return;

  const selection = document.getSelection();
  if (!selection) return;
  selection.deleteFromDocument();
  if (selection.rangeCount === 0) {
    const seed = document.createRange();
    seed.selectNodeContents(element);
    seed.collapse(false);
    selection.addRange(seed);
  }
  const range = selection.getRangeAt(0);
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Inserts a plain `\n` at the current caret inside `element`.
 *
 * @param element - Focused contenteditable label host.
 * @returns No value.
 */
export function insertEditableNewline(element: HTMLElement): void {
  insertEditablePlainText(element, "\n");
}

/**
 * True when a native editing event is Enter creating a visual line break.
 *
 * `insertParagraph` is the default Enter action; `insertLineBreak` is
 * Shift+Enter (and some plaintext hosts). Neither stores a `\n` character.
 *
 * @param inputType - `InputEvent.inputType` from `beforeinput`.
 * @returns Whether the default action should be replaced with a plain newline.
 */
export function isEditableNewlineInput(inputType: string): boolean {
  return inputType === "insertParagraph" || inputType === "insertLineBreak";
}
