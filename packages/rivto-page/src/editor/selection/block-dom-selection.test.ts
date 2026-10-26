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
