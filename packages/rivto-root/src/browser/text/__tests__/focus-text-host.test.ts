import { focusBrowserTextContent } from "../focus-text-host";

/**
 * Mounts an editable host with a stable block identity for native caret assertions.
 *
 * @param id - Block identity used by the selection resolver.
 * @param markup - Editable text and inline markup, including empty-content fixtures.
 * @returns Mounted content; the caller removes its owning shell after the assertion.
 */
function mountCaretContent(id: string, markup: string): HTMLElement {
  const block = document.createElement("div");
  block.dataset.blockId = id;
  block.innerHTML = `<div data-block-content contenteditable="true" tabindex="0">${markup}</div>`;
  document.body.append(block);
  return block.firstElementChild as HTMLElement;
}

it.each([
  { offset: -2, expectedText: "ab", expectedOffset: 0 },
  { offset: 3, expectedText: "cd", expectedOffset: 1 },
  { offset: 4, expectedText: "cd", expectedOffset: 2 },
  { offset: Number.NaN, expectedText: "cd", expectedOffset: 2 },
])(
  "places a caret in nested text at offset $offset",
  ({ offset, expectedText, expectedOffset }) => {
    const content = mountCaretContent("text", "ab<strong>cd</strong>");
    const focus = jest.spyOn(content, "focus");
    try {
      focusBrowserTextContent(content, offset, () => true);
      expect(focus).toHaveBeenCalledWith();
      expect(document.activeElement).toBe(content);
      const selection = document.getSelection()!;
      expect(selection.isCollapsed).toBe(true);
      expect(selection.focusNode?.textContent).toBe(expectedText);
      expect(selection.focusOffset).toBe(expectedOffset);
    } finally {
      focus.mockRestore();
      content.parentElement?.remove();
    }
  },
);

it.each(["", "<br>", "abc<br>"])("preserves end-of-content placement for %s", (markup) => {
  const content = mountCaretContent("end", markup);
  try {
    focusBrowserTextContent(content, 99, () => true);
    const selection = document.getSelection()!;
    expect(selection.focusNode).toBe(content);
    expect(selection.focusOffset).toBe(content.childNodes.length);
    expect(selection.isCollapsed).toBe(true);
  } finally {
    content.parentElement?.remove();
  }
});
