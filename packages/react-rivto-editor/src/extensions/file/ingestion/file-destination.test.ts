/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { createCaretSelection, createTextSelection } from "@chulane/rivto";
import {
  fileDestinationAtPoint,
  filePasteDestination,
  filePickerPoint,
  inlineDestination,
} from "./file-destination";

test("places picker feedback at the block or at the viewport center", () => {
  const originalCSS = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    // The fixture's simple block ID needs no selector escaping.
    value: { escape: (value: string) => value },
  });
  const root = document.createElement("div");
  const block = document.createElement("div");
  block.dataset.blockId = "target";
  const bounds = block.getBoundingClientRect();
  Object.assign(bounds, { left: 120, bottom: 240 });
  block.getBoundingClientRect = () => bounds;
  root.append(block);
  try {
    expect(filePickerPoint(root, "target")).toEqual({ x: 120, y: 240 });
    Object.assign(bounds, { left: 0, bottom: 0 });
    expect(filePickerPoint(root, "target")).toEqual({ x: 0, y: 0 });
    expect(filePickerPoint(root, "missing")).toEqual({ x: innerWidth / 2, y: innerHeight / 2 });
    expect(filePickerPoint(null, "target")).toEqual({ x: innerWidth / 2, y: innerHeight / 2 });
  } finally {
    if (originalCSS) {
      Object.defineProperty(globalThis, "CSS", originalCSS);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

test("ignores a selection whose block no longer exists", () => {
  const selection = createCaretSelection("deleted", 0);
  // Keep a stored selection whose block lookup deliberately fails.
  const panel = {
    // No DOM selection exists, so the stored selection is used.
    selection: { readDOM: () => undefined, get: () => selection },
    // The selected block was deleted before the destination was captured.
    blocks: { getBlock: () => undefined },
  };
  expect(inlineDestination(panel)).toBeUndefined();
});

test.each(["standard", "legacy", "unresolved"] as const)(
  "keeps the correct native selection when caret hit testing is %s",
  async (method) => {
    const core = await createTestCoreEditor();
    const panel = createTestReactEditor({ editor: core });
    const root = document.createElement("div");
    const text = document.createTextNode("hello");
    root.append(text);
    document.body.append(root);
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(text, 1, text, 1);
    const range = document.createRange();
    range.setStart(text, 3);
    range.collapse(true);
    const standard = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint");
    const legacy = Object.getOwnPropertyDescriptor(document, "caretRangeFromPoint");
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      // Supply a standard caret position only for the corresponding case.
      value: () => (method === "standard" ? { offsetNode: text, offset: 3 } : null),
    });
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      // Supply a legacy caret range only for the corresponding case.
      value: () => (method === "legacy" ? range : null),
    });
    try {
      fileDestinationAtPoint(
        { reactPanel: panel, mode: "block", contentElement: root, blockId: undefined, root },
        { x: 10, y: 20 },
      );
      expect(selection.anchorNode).toBe(text);
      expect(selection.anchorOffset).toBe(method === "unresolved" ? 1 : 3);
      expect(selection.focusOffset).toBe(method === "unresolved" ? 1 : 3);
    } finally {
      if (standard) {
        Object.defineProperty(document, "caretPositionFromPoint", standard);
      } else {
        Reflect.deleteProperty(document, "caretPositionFromPoint");
      }
      if (legacy) {
        Object.defineProperty(document, "caretRangeFromPoint", legacy);
      } else {
        Reflect.deleteProperty(document, "caretRangeFromPoint");
      }
      root.remove();
      await panel.editor.destroy();
      await core.destroy();
    }
  },
);

test("converts canvas drop and surface paste coordinates using pan and zoom", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.edgelessPanX = "20";
  root.dataset.edgelessPanY = "-10";
  root.dataset.edgelessZoom = "2";
  const bounds = root.getBoundingClientRect();
  Object.assign(bounds, {
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 300,
    bottom: 150,
    width: 200,
    height: 100,
  });
  root.getBoundingClientRect = () => bounds;
  const context = {
    reactPanel: panel,
    mode: "edgeless" as const,
    contentElement: null,
    blockId: undefined,
    root,
  };
  try {
    expect(fileDestinationAtPoint(context, { x: 180, y: 120 })).toEqual({
      kind: "element",
      x: 30,
      y: 40,
    });
    expect(filePasteDestination(context)).toEqual({
      destination: { kind: "element", x: 40, y: 30 },
      point: { x: 200, y: 150 },
    });
    expect(
      fileDestinationAtPoint({ ...context, mode: "block", blockId: "target" }, { x: 180, y: 120 }),
    ).toEqual({ kind: "block", afterId: "target" });
  } finally {
    await panel.editor.destroy();
    await core.destroy();
  }
});

test("captures a text range or falls back to the end of a block", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = core.blocks.insertBlock({ type: "paragraph", content: "alpha" });
  const second = core.blocks.insertBlock({ type: "paragraph", content: "omega" });
  const blocks = [first, second].map(({ id, content }) => ({ id, length: content.length }));
  try {
    panel.selection.set(
      createTextSelection(
        blocks,
        { blockId: first.id, offset: 4 },
        { blockId: first.id, offset: 1 },
      )!,
    );
    expect(inlineDestination(panel, second.id)).toEqual({
      kind: "inline",
      blockId: first.id,
      content: "alpha",
      start: 1,
      end: 4,
    });
    const root = document.createElement("div");
    expect(
      fileDestinationAtPoint(
        { reactPanel: panel, mode: "block", contentElement: root, blockId: second.id, root },
        { x: 10, y: 20 },
      ),
    ).toEqual({ kind: "inline", blockId: first.id, content: "alpha", start: 1, end: 4 });
    panel.selection.set(
      createTextSelection(
        blocks,
        { blockId: first.id, offset: 2 },
        { blockId: second.id, offset: 3 },
      )!,
    );
    expect(inlineDestination(panel, second.id)).toEqual({
      kind: "inline",
      blockId: second.id,
      content: "omega",
      start: 5,
      end: 5,
    });
    expect(inlineDestination(panel, "missing")).toBeUndefined();
  } finally {
    await panel.editor.destroy();
    await core.destroy();
  }
});
