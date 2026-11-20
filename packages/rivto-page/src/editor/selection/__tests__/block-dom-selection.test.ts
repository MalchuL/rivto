import { BlockLayoutRegions } from "../../../presentation/components/block-layout/block-layout-regions";
import { BlockPointerHitTest } from "../block-pointer-hit-test";
import { BlockVirtualizationRegistry } from "../../virtualization/block-virtualization-registry";
import { mockCaretGeometry } from "./caret-geometry";
import { BlockDOMSelection } from "../block-dom-selection";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockSelectionRanges } from "../block-selection-ranges";

const selectionSource = {
  getSelectableBlockIds: () => ["first", "image", "last"],
  getTextLength: (id: string) => ({ first: 5, last: 4 })[id],
};

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
  const dom = new BlockDOMSelection(selectionSource, new BlockVirtualizationRegistry());
  const detach = dom.attach(
    new BlockPointerHitTest(new BrowserInputRoot(root), new BlockLayoutRegions()),
    new BrowserInputRoot(root),
  );
  try {
    const selection = BlockSelectionRanges.createFromPositions(
      selectionSource,
      { blockId: "last", offset: 3 },
      { blockId: "first", offset: 1 },
    )!;
    expect(selection.blocks).toEqual([
      { id: "first", start: 1, end: 5 },
      { id: "image", start: 0, end: -1 },
      { id: "last", start: 0, end: 3 },
    ]);
    expect(dom.restoreEditorDOMSelection(selection)).toBe(true);
    const native = document.getSelection()!;
    expect(native.anchorNode?.textContent).toBe("Last");
    expect(native.anchorOffset).toBe(3);
    expect(native.focusNode?.textContent).toBe("First");
    expect(native.focusOffset).toBe(1);
    expect(dom.readEditorDOMSelection()).toEqual(selection);
    expect(
      dom.restoreEditorDOMSelection({
        type: "selection",
        blocks: [{ id: "missing", start: 0, end: 1 }],
      }),
    ).toBe(false);
  } finally {
    detach();
    root.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("resolves wrapped lines without mounting neighbors until the block edge", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="current"><div data-block-content>abcdef</div></div><div data-block-id="next"><div data-block-content>uvwxyz</div></div>';
  document.body.append(root);
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const restoreGeometry = mockCaretGeometry(
    (_text, offset) => (offset > 2 ? offset - 3 : offset) * 10,
    (offset) => (offset > 2 ? 20 : 0),
  );
  const mount = jest.fn();
  const focus = jest.spyOn(content, "focus");
  const dom = new BlockDOMSelection(selectionSource, new BlockVirtualizationRegistry());
  const occurrence = new BrowserInputRoot(root);
  const detach = dom.attach(
    new BlockPointerHitTest(occurrence, new BlockLayoutRegions()),
    occurrence,
  );
  try {
    expect(dom.verticalCaretPosition({ blockId: "current", offset: 1 }, "down", mount)).toEqual({
      blockId: "current",
      offset: 4,
    });
    expect(dom.verticalCaretPosition({ blockId: "current", offset: 4 }, "up", mount)).toEqual({
      blockId: "current",
      offset: 1,
    });
    expect(mount).not.toHaveBeenCalled();
    expect(dom.verticalCaretPosition({ blockId: "current", offset: 6 }, "down", mount)).toEqual({
      blockId: "next",
      offset: 2,
    });
    expect(mount).not.toHaveBeenCalled();
    expect(
      dom.verticalCaretPosition({ blockId: "current", offset: 0 }, "up", mount),
    ).toBeUndefined();
    expect(mount).toHaveBeenCalledWith("current", -1);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    detach();
    occurrence.detach();
    restoreGeometry();
    focus.mockRestore();
    root.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
