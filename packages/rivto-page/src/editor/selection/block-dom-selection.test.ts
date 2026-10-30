import { BlockDOMSelection } from "./block-dom-selection";
import { BlockVirtualizationController } from "../virtualization/block-virtualization-controller";

it.each([true, false])("requests mounting only for an absent shell, rendered=%s", (rendered) => {
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  if (rendered) {
    root.innerHTML = '<div data-block-id="card"><strong>Structural card</strong></div>';
  }
  document.body.append(root);
  const mountBlocks = jest.fn(() => {
    if (!rendered) {
      root.innerHTML = '<div data-block-id="card"><div data-block-content>Text</div></div>';
    }
  });
  const bridge = jest
    .spyOn(BlockVirtualizationController, "getForRoot")
    .mockReturnValue({ mountBlocks });
  try {
    const dom = new BlockDOMSelection({
      getSelectableBlockIds: () => ["card"],
      getTextLength: () => 4,
    });
    const point = dom.resolveDOMSelectionPoint(root, { blockId: "card", offset: 0 });
    expect(mountBlocks).toHaveBeenCalledTimes(rendered ? 0 : 1);
    expect(Boolean(point)).toBe(!rendered);
  } finally {
    bridge.mockRestore();
    root.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("restores reverse endpoints in their occurrence and retains unmounted contentless coverage", () => {
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-rivto-block-editor><div data-block-id="last"><span data-block-content>Foreign</span></div></div><div data-block-id="first"><span data-block-content contenteditable="true">First</span></div><div data-block-id="last"><span data-block-content contenteditable="true">Last</span></div>';
  document.body.append(root);
  const dom = new BlockDOMSelection({
    getSelectableBlockIds: () => ["first", "image", "last"],
    getTextLength: (id) => ({ first: 5, last: 4 })[id],
  });
  try {
    const selection = dom.createSelection(
      { blockId: "last", offset: 3 },
      { blockId: "first", offset: 1 },
    )!;
    expect(selection.blocks).toEqual([
      { id: "first", start: 1, end: 5 },
      { id: "image", start: 0, end: -1 },
      { id: "last", start: 0, end: 3 },
    ]);
    expect(dom.restoreEditorDOMSelection(root, selection)).toBe(true);
    const native = document.getSelection()!;
    expect(native.anchorNode?.textContent).toBe("Last");
    expect(native.anchorOffset).toBe(3);
    expect(native.focusNode?.textContent).toBe("First");
    expect(native.focusOffset).toBe(1);
    expect(dom.readEditorDOMSelection(root)).toEqual(selection);
    expect(
      dom.restoreEditorDOMSelection(root, {
        type: "selection",
        blocks: [{ id: "missing", start: 0, end: 1 }],
      }),
    ).toBe(false);
  } finally {
    root.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

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
])(
  "places a caret in nested text at offset $offset",
  ({ offset, expectedText, expectedOffset }) => {
    const content = mountCaretContent("text", "ab<strong>cd</strong>");
    const focus = jest.spyOn(content, "focus");
    try {
      BlockDOMSelection.focusContent(content, offset);
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
    BlockDOMSelection.focusContent(content, 99);
    const selection = document.getSelection()!;
    expect(selection.focusNode).toBe(content);
    expect(selection.focusOffset).toBe(content.childNodes.length);
    expect(selection.isCollapsed).toBe(true);
  } finally {
    content.parentElement?.remove();
  }
});

it("resolves wrapped lines without mounting neighbors until the block edge", () => {
  const content = mountCaretContent("current", "abcdef");
  const adjacent = mountCaretContent("next", "uvwxyz");
  const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    /**
     * Models two wrapped lines, retaining the end-of-text caret on the second.
     *
     * @returns A nonempty caret rectangle for the range's text offset.
     */
    value(this: Range) {
      const offset = this.startOffset;
      return {
        left: (offset > 2 ? offset - 3 : offset) * 10,
        top: offset > 2 ? 20 : 0,
        height: 20,
      };
    },
  });
  const getAdjacent = jest.fn(() => adjacent);
  const focus = jest.spyOn(content, "focus");
  try {
    expect(BlockDOMSelection.verticalCaretPosition(content, 1, "down", getAdjacent)).toEqual({
      blockId: "current",
      offset: 4,
    });
    expect(BlockDOMSelection.verticalCaretPosition(content, 4, "up", getAdjacent)).toEqual({
      blockId: "current",
      offset: 1,
    });
    expect(getAdjacent).not.toHaveBeenCalled();
    expect(BlockDOMSelection.verticalCaretPosition(content, 6, "down", getAdjacent)).toEqual({
      blockId: "next",
      offset: 2,
    });
    expect(getAdjacent).toHaveBeenCalledTimes(1);
    expect(
      BlockDOMSelection.verticalCaretPosition(content, 0, "up", () => undefined),
    ).toBeUndefined();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    if (descriptor) {
      Object.defineProperty(Range.prototype, "getBoundingClientRect", descriptor);
    } else {
      Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    }
    focus.mockRestore();
    content.parentElement?.remove();
    adjacent.parentElement?.remove();
  }
});
