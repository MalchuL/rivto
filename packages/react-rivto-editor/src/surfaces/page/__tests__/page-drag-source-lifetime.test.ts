/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { PageBlockDrag } from "../page-block-drag";
import { PageDragOccurrence } from "../page-drag-occurrence";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not resolve a drag after its source occurrence is replaced on the same element", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  document.body.append(element);
  const resolve = jestApi.fn(() => undefined);
  const previousHitTest = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });
  const drag = new PageBlockDrag(panel);
  const detach = drag.attach({ resolve }, new BrowserInputRoot(element), { isCurrent: () => true });
  const replacement = new PageDragOccurrence(
    panel,
    {
      resolve: () => undefined,
    },
    new BrowserInputRoot(element),
    { isCurrent: () => true },
  );
  try {
    expect(drag.resolve(1, 2, new Set())).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
  } finally {
    replacement.destroy();
    detach();
    if (previousHitTest) {
      Object.defineProperty(document, "elementFromPoint", previousHitTest);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    element.remove();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("rejects routing and moves when the input registration expires while the Root stays attached", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = core.blocks.insertBlock({ type: "paragraph", content: "first" });
  const second = core.blocks.insertBlock({ type: "paragraph", content: "second" });
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let current = true;
  const registration = { isCurrent: () => current };
  const resolve = jestApi.fn(() => undefined);
  const previousHitTest = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });
  const drag = new PageBlockDrag(panel);
  const detach = drag.attach({ resolve }, root, registration);
  const destination = {
    kind: "between" as const,
    parentId: null,
    previousId: second.id,
    nextId: null,
  };
  try {
    expect(drag.canMove([first.id], destination)).toBe(true);
    current = false;
    expect(root.isAttached()).toBe(true);
    expect(drag.resolve(1, 2, new Set())).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
    expect(drag.canMove([first.id], destination)).toBe(false);
    expect(drag.moveBlocks([first.id], destination)).toBe(false);
    expect(drag.getPreview([first.id], 10)).toEqual([]);
    expect(core.blocks.getRootIds()).toEqual([first.id, second.id]);
    current = true;
    detach();
    expect(drag.canMove([first.id], destination)).toBe(false);
  } finally {
    detach();
    root.detach();
    if (previousHitTest) {
      Object.defineProperty(document, "elementFromPoint", previousHitTest);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    element.remove();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("discards preview rows when the source expires during a block read", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "first" });
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let current = true;
  const registration = { isCurrent: () => current };
  const drag = new PageBlockDrag(panel);
  const detach = drag.attach({ resolve: () => undefined }, root, registration);
  const read = panel.blocks.getBlockNode.bind(panel.blocks);
  const readSpy = jestApi.spyOn(panel.blocks, "getBlockNode").mockImplementation((id) => {
    const result = read(id);
    current = false;
    return result;
  });
  try {
    expect(drag.getPreview([block.id], 10)).toEqual([]);
    expect(readSpy).toHaveBeenCalled();
  } finally {
    readSpy.mockRestore();
    detach();
    root.detach();
    element.remove();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("rejects a foreign destination that expires while move policy is checked", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = core.blocks.insertBlock({ type: "paragraph", content: "first" });
  const second = core.blocks.insertBlock({ type: "paragraph", content: "second" });
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let current = true;
  const registration = { isCurrent: () => current };
  const occurrence = new PageDragOccurrence(
    panel,
    { resolve: () => undefined },
    root,
    registration,
  );
  const policy = jestApi.spyOn(panel.editor.blockBehaviors, "canMove").mockImplementation(() => {
    current = false;
    return true;
  });
  const drag = new PageBlockDrag(panel);
  const destination = {
    kind: "between" as const,
    parentId: null,
    previousId: second.id,
    nextId: null,
  };
  try {
    expect(drag.canMove([first.id], destination, occurrence)).toBe(false);
    expect(policy).toHaveBeenCalled();
    expect(drag.moveBlocks([first.id], destination, occurrence)).toBe(false);
    expect(core.blocks.getRootIds()).toEqual([first.id, second.id]);
  } finally {
    policy.mockRestore();
    occurrence.destroy();
    root.detach();
    element.remove();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not publish selection after a committed move expires its source registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = core.blocks.insertBlock({ type: "paragraph", content: "first" });
  const second = core.blocks.insertBlock({ type: "paragraph", content: "second" });
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let current = true;
  const registration = { isCurrent: () => current };
  const drag = new PageBlockDrag(panel);
  const detach = drag.attach({ resolve: () => undefined }, root, registration);
  const move = panel.blocks.moveBlocks.bind(panel.blocks);
  const moveSpy = jestApi.spyOn(panel.blocks, "moveBlocks").mockImplementation((...args) => {
    move(...args);
    current = false;
  });
  const select = jestApi.spyOn(panel.selection, "set");
  try {
    const destination = {
      kind: "between" as const,
      parentId: null,
      previousId: second.id,
      nextId: null,
    };
    expect(drag.moveBlocks([first.id], destination)).toBe(true);
    expect(core.blocks.getRootIds()).toEqual([second.id, first.id]);
    expect(select).not.toHaveBeenCalled();
  } finally {
    select.mockRestore();
    moveSpy.mockRestore();
    detach();
    root.detach();
    element.remove();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not publish selection if reading the moved siblings expires the source registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const first = core.blocks.insertBlock({ type: "paragraph", content: "first" });
  const second = core.blocks.insertBlock({ type: "paragraph", content: "second" });
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let current = true;
  let moved = false;
  const registration = { isCurrent: () => current };
  const drag = new PageBlockDrag(panel);
  const detach = drag.attach({ resolve: () => undefined }, root, registration);
  const move = panel.blocks.moveBlocks.bind(panel.blocks);
  const moveSpy = jestApi.spyOn(panel.blocks, "moveBlocks").mockImplementation((...args) => {
    move(...args);
    moved = true;
  });
  const getRoots = panel.blocks.getRootIds.bind(panel.blocks);
  const rootsSpy = jestApi.spyOn(panel.blocks, "getRootIds").mockImplementation(() => {
    const result = getRoots();
    if (moved) {
      current = false;
    }
    return result;
  });
  const select = jestApi.spyOn(panel.selection, "set");
  try {
    const destination = {
      kind: "between" as const,
      parentId: null,
      previousId: second.id,
      nextId: null,
    };
    expect(drag.moveBlocks([first.id], destination)).toBe(true);
    expect(core.blocks.getRootIds()).toEqual([second.id, first.id]);
    expect(select).not.toHaveBeenCalled();
  } finally {
    select.mockRestore();
    rootsSpy.mockRestore();
    moveSpy.mockRestore();
    detach();
    root.detach();
    element.remove();
    panel.editor.destroy();
    await core.destroy();
  }
});
