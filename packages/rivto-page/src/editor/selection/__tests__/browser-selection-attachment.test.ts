import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { BlockEditorApi } from "../../types";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("reads only the current occurrence and ignores stale attachment cleanup", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("first", { content: "First" });
  adapter.setNode("second", { content: "Second" });
  adapter.setBlockIds(["first", "second"]);
  const editor = new BlockEditorController({ adapter });
  const api: BlockEditorApi = editor;
  const checkType = () => {
    // @ts-expect-error Consumers cannot attach the browser selection owner.
    return api.browserSelection.attach;
  };
  void checkType;
  const first = document.createElement("div");
  const second = document.createElement("div");
  first.dataset.rivtoBlockEditor = "true";
  second.dataset.rivtoBlockEditor = "true";
  first.innerHTML = '<div data-block-id="first"><span data-block-content>First</span></div>';
  second.innerHTML = '<div data-block-id="second"><span data-block-content>Second</span></div>';
  document.body.append(first, second);
  try {
    expect(api.browserSelection.readEditorDOMSelection()).toBeUndefined();
    const detachFirst = attachTestRoot(editor, first);
    const selection = document.getSelection()!;
    const firstText = first.querySelector("[data-block-content]")!.firstChild!;
    selection.setBaseAndExtent(firstText, 1, firstText, 3);
    expect(api.browserSelection.readEditorDOMSelection()?.blocks).toEqual([
      { id: "first", start: 1, end: 3 },
    ]);
    detachFirst();
    const detachSecond = attachTestRoot(editor, second);
    detachFirst();
    expect(api.browserSelection.readEditorDOMSelection()).toBeUndefined();
    const secondText = second.querySelector("[data-block-content]")!.firstChild!;
    selection.setBaseAndExtent(secondText, 2, secondText, 4);
    expect(api.browserSelection.readEditorDOMSelection()?.blocks).toEqual([
      { id: "second", start: 2, end: 4 },
    ]);
    detachSecond();
    expect(api.browserSelection.readEditorDOMSelection()).toBeUndefined();
  } finally {
    editor.destroy();
    first.remove();
    second.remove();
    document.getSelection()?.removeAllRanges();
  }
});

it("releases selection attachment when input listener setup fails", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const attach = jest.spyOn(editor.events, "attach").mockImplementationOnce(() => {
    throw new Error("input setup failed");
  });
  try {
    expect(() => attachTestRoot(editor, root)).toThrow("input setup failed");
    const detach = attachTestRoot(editor, root);
    detach();
    expect(editor.browserSelection.readEditorDOMSelection()).toBeUndefined();
  } finally {
    attach.mockRestore();
    editor.destroy();
  }
});

it("retains virtualized endpoints only while a missing endpoint belongs to the attached view", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="first"></div>';
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const releaseView = editor.virtualization.register(getBrowserElementIdentity(root), {
    mountBlocks: jest.fn(),
    observeRoot: () => () => {},
  });
  const selection = {
    type: "selection" as const,
    blocks: [],
    anchorBlockId: "first",
    focusBlockId: "second",
  };
  try {
    const detach = attachTestRoot(editor, root);
    expect(editor.browserSelection.hasVirtualizedMissingEndpoints(selection)).toBe(true);
    root.insertAdjacentHTML(
      "beforeend",
      '<div data-rivto-block-editor><div data-block-id="second"></div></div>',
    );
    expect(editor.browserSelection.hasVirtualizedMissingEndpoints(selection)).toBe(true);
    root.insertAdjacentHTML("beforeend", '<div data-block-id="second"></div>');
    expect(editor.browserSelection.hasVirtualizedMissingEndpoints(selection)).toBe(false);
    detach();
    expect(editor.browserSelection.hasVirtualizedMissingEndpoints(selection)).toBe(false);
  } finally {
    releaseView();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
    editor.destroy();
  }
});

it("releases selection attachment when event cleanup fails", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const first = document.createElement("div");
  const second = document.createElement("div");
  const attach = jest.spyOn(editor.events, "attach").mockReturnValueOnce(() => {
    throw new Error("input cleanup failed");
  });
  try {
    const detach = attachTestRoot(editor, first);
    expect(detach).toThrow("input cleanup failed");
    const detachSecond = attachTestRoot(editor, second);
    detach();
    expect(editor.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(second));
    detachSecond();
  } finally {
    attach.mockRestore();
    editor.destroy();
  }
});

it("finds virtualized endpoints with selector characters in their IDs", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const block = document.createElement("div");
  block.dataset.blockId = 'quoted"id';
  root.append(block);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") },
  });
  const releaseView = editor.virtualization.register(getBrowserElementIdentity(root), {
    mountBlocks: jest.fn(),
    observeRoot: () => () => {},
  });
  try {
    attachTestRoot(editor, root);
    expect(
      editor.browserSelection.hasVirtualizedMissingEndpoints({
        type: "selection",
        blocks: [],
        anchorBlockId: 'quoted"id',
        focusBlockId: 'quoted"id',
      }),
    ).toBe(false);
  } finally {
    releaseView();
    editor.destroy();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
