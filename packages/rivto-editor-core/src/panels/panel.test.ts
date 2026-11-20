import { ChildrenPanel } from "./children-panel";
import { EmbeddingPanel } from "./embedding-panel";
import { createTestEditor } from "../editor/test-utils";
import type { DocumentEditorAPI } from "../editor/types";
import { BlockManager } from "../managers/block-manager/block-manager";
import { ElementManager } from "../managers/element-manager/element-manager";
import { createCaretSelection, createStructuralSelection } from "../managers/selection-manager";

it("keeps selection deletion inside the panel and protects an embedding root", async () => {
  const editor = await createTestEditor();
  editor.blocks.insertBlock({
    id: "root",
    type: "paragraph",
    children: [{ id: "child", type: "paragraph" }],
  });
  editor.blocks.insertBlock({ id: "outside", type: "paragraph" });
  const panel = new EmbeddingPanel(editor, { rootBlockId: "root" });
  try {
    const outside = editor.blocks.getBlock("outside")!;
    expect(panel.blocks.canMove({ sources: [outside], destination: { parentId: null } })).toBe(
      false,
    );
    const root = editor.blocks.getBlock("root")!;
    expect(panel.blocks.canMove({ sources: [root], destination: { parentId: null } })).toBe(false);
    expect(() => panel.selection.set(createStructuralSelection(["outside"]))).toThrow();
    editor.selection.set(createStructuralSelection(["outside"]));
    expect(panel.selection.get()).toBeUndefined();
    panel.selection.delete();
    expect(editor.blocks.hasBlock("outside")).toBe(true);
    panel.selection.set(createStructuralSelection(["root"]));
    panel.selection.delete();
    expect(editor.blocks.hasBlock("root")).toBe(true);
    panel.selection.set(createStructuralSelection(["child"]));
    panel.selection.delete();
    expect(editor.blocks.hasBlock("child")).toBe(false);
    editor.history.undo();
    expect(editor.blocks.hasBlock("child")).toBe(true);
  } finally {
    await panel.destroy();
    await editor.destroy();
  }
});

it("deletes selected text and blocks independently of a missing element root", async () => {
  const editor = await createTestEditor();
  const panel = new ChildrenPanel(editor, { rootElementId: "missing" });
  try {
    editor.blocks.insertBlock({ id: "child", type: "paragraph", content: "abc" });
    panel.selection.set({
      ...createCaretSelection("child", 1),
      blocks: [{ id: "child", start: 1, end: 2 }],
    });
    panel.selection.delete();
    expect(editor.blocks.getBlock("child")?.content).toBe("ac");
    expect(panel.selection.get()?.blocks).toEqual([{ id: "child", start: 1, end: 1 }]);
    panel.selection.set(createStructuralSelection(["child"]));
    panel.selection.delete();
    expect(editor.blocks.hasBlock("child")).toBe(false);
  } finally {
    await panel.destroy();
    await editor.destroy();
  }
});

it("checks a hidden receiving parent's move behavior through nested panels", async () => {
  const editor = await createTestEditor();
  const outer = new ChildrenPanel(editor, { rootBlockId: "root" });
  const inner = new ChildrenPanel(outer);
  try {
    editor.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    const sources = [editor.blocks.getBlock("child")!];
    const destination = { parentId: null, beforeId: "child" };
    expect(inner.blocks.canMove({ sources, destination })).toBe(true);
    editor.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "root",
      canMove: () => false,
    });
    expect(inner.blocks.canMove({ sources, destination })).toBe(false);
    expect(outer.blocks.canMove({ sources, destination })).toBe(false);
  } finally {
    await inner.destroy();
    await outer.destroy();
    await editor.destroy();
  }
});

it("notifies selection observers when a selected subtree leaves or reenters the panel", async () => {
  const editor = await createTestEditor();
  const panel = new ChildrenPanel(editor, { rootBlockId: "root" });
  try {
    editor.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    editor.blocks.insertBlock({ id: "outside", type: "paragraph" });
    panel.selection.set(createCaretSelection("child", 0));
    const changed = jest.fn();
    const stop = panel.selection.subscribe(changed);
    editor.blocks.moveBlocks(["child"], "outside", "inside");
    expect(panel.selection.snapshot()).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(1);
    editor.blocks.moveBlocks(["child"], "root", "inside");
    expect(panel.selection.snapshot()?.focusBlockId).toBe("child");
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
    editor.selection.clear();
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    await panel.destroy();
    await editor.destroy();
  }
});

it("uses shared paste registrations with the receiving panel and rejects outside targets", async () => {
  const editor = await createTestEditor();
  editor.blocks.insertBlock({
    id: "root",
    type: "paragraph",
    children: [{ id: "child", type: "paragraph", content: "inside" }],
  });
  editor.blocks.insertBlock({ id: "outside", type: "paragraph", content: "outside" });
  const panel = new ChildrenPanel(editor, { rootBlockId: "root" });
  const observe = jest.fn();
  const dispose = editor.clipboard.pasteStrategies.register("test.panel", {
    matches: () => true,
    paste: (context) => {
      observe(context.editor);
      return undefined;
    },
  });
  try {
    expect(panel.clipboard.pasteStrategies).toBe(editor.clipboard.pasteStrategies);
    expect(() => panel.clipboard.copy(createStructuralSelection(["outside"]))).toThrow();
    expect(() => panel.clipboard.paste({ text: "x", placement: { afterId: "outside" } })).toThrow();
    panel.clipboard.paste({ text: "new", defaultBlockType: "paragraph" });
    expect(observe).toHaveBeenCalledWith(panel);
    expect(panel.blocks.getBlocks().map((block) => block.content)).toEqual(["inside", "new"]);
    editor.history.undo();
    expect(panel.blocks.getBlocks().map((block) => block.content)).toEqual(["inside"]);
    dispose();
    observe.mockClear();
    panel.clipboard.paste({ text: "again", defaultBlockType: "paragraph" });
    expect(observe).not.toHaveBeenCalled();
  } finally {
    dispose();
    await panel.destroy();
    await editor.destroy();
  }
});

it("pastes a multiline text selection inside a protected embedding root", async () => {
  const editor = await createTestEditor();
  editor.blocks.insertBlock({ id: "root", type: "paragraph", content: "root" });
  const panel = new EmbeddingPanel(editor, { rootBlockId: "root" });
  try {
    panel.clipboard.paste({
      text: "first\nsecond",
      defaultBlockType: "paragraph",
      textTarget: createCaretSelection("root", 4),
    });
    expect(editor.blocks.getBlock("root")?.content).toBe("rootfirst");
    expect(editor.blocks.getBlock("root")?.children.map((block) => block.content)).toEqual([
      "second",
    ]);
    expect(editor.blocks.getRootIds()).toEqual(["root"]);
  } finally {
    await panel.destroy();
    await editor.destroy();
  }
});

it("keeps a nested panel subscription alive after its source panel is destroyed", async () => {
  const editor = await createTestEditor();
  editor.blocks.insertBlock({
    id: "root",
    type: "paragraph",
    children: [{ id: "child", type: "paragraph" }],
  });
  const shape = { type: "shape", zIndex: 0, frame: { x: 0, y: 0, width: 10, height: 10 } };
  editor.elements.insertElement({
    ...shape,
    id: "container",
    children: [{ ...shape, id: "element" }],
  });
  const source = new ChildrenPanel(editor, { rootBlockId: "root", rootElementId: "container" });
  const borrowed = new Proxy(source, {
    /**
     * Simulates a panel implementation that omits its optional rootBlockId property.
     *
     * @param target - Source panel whose other members remain unchanged.
     * @param key - Property checked by the consumer.
     * @returns Whether the property is exposed by this source.
     */
    has(target, key) {
      return key !== "rootBlockId" && Reflect.has(target, key);
    },
  });
  const nested = new ChildrenPanel(borrowed);
  const changed = jest.fn();
  const elementChanged = jest.fn();
  const selectionChanged = jest.fn();
  const editorChanged = jest.fn();
  nested.blocks.subscribeBlockNode("child", changed);
  nested.elements.subscribeElementNode("element", elementChanged);
  nested.selection.subscribe(selectionChanged);
  nested.subscribe(editorChanged);
  try {
    await source.destroy();
    editor.blocks.updateBlock("child", { content: "updated" });
    editor.elements.updateElement("element", { frame: { x: 1 } });
    editor.selection.set(createCaretSelection("child", 0));
    expect(changed).toHaveBeenCalled();
    expect(elementChanged).toHaveBeenCalled();
    expect(selectionChanged).toHaveBeenCalled();
    expect(editorChanged).toHaveBeenCalled();
  } finally {
    await nested.destroy();
    await editor.destroy();
  }
});

it("exposes the editor contract while borrowing its shared resources", async () => {
  const editor = await createTestEditor();
  try {
    const panel = new ChildrenPanel(editor);
    const compatible: DocumentEditorAPI = panel;
    expect(compatible.getDocument()).toBe(editor.getDocument());
    expect(panel.blocks).toBeInstanceOf(BlockManager);
    expect(panel.elements).toBeInstanceOf(ElementManager);
    expect(panel.document).toBe(editor);
    expect(panel.getDocument()).toBe(editor.getDocument());
    expect(panel.history).toBe(editor.history);
    expect(panel.blockRegistry).toBe(editor.blockRegistry);
  } finally {
    await editor.destroy();
  }
});

it.each(["children", "embedding"] as const)(
  "keeps snapshot operations document-wide through a %s panel",
  async (kind) => {
    const editor = await createTestEditor();
    editor.blocks.insertBlock({ id: "root", type: "paragraph" });
    editor.blocks.insertBlock({ id: "outside", type: "paragraph", content: "before" });
    const panel =
      kind === "children"
        ? new ChildrenPanel(editor, { rootBlockId: "root" })
        : new EmbeddingPanel(editor, { rootBlockId: "root" });
    try {
      const snapshot = panel.dump();
      editor.blocks.updateBlock("outside", { content: "changed" });
      panel.load(snapshot);
      expect(panel.getDocument()).toBe(editor.getDocument());
      expect(panel.blocks.getBlock("outside")).toBeUndefined();
      expect(editor.blocks.getBlock("outside")?.content).toBe("before");
      editor.history.undo();
      expect(editor.blocks.getBlock("outside")?.content).toBe("before");
    } finally {
      await panel.destroy();
      await editor.destroy();
    }
  },
);

it("keeps processors and history shared when a panel is destroyed", async () => {
  const editor = await createTestEditor();
  const panel = new ChildrenPanel(editor);
  const other = new ChildrenPanel(editor);
  try {
    const dispose = editor.blocks.registerProcessor({
      id: "panel-test-processor",
      priority: 1,
      processor: (block) => ({ ...block, content: `${block.content ?? ""}!` }),
    });
    const first = panel.blocks.insertBlock({ type: "paragraph", content: "one" });
    expect(first.content).toBe("one!");
    const disposeElement = editor.elements.registerProcessor({
      id: "panel-test-element-processor",
      priority: 1,
      processor: (element) => ({ ...element, zIndex: element.zIndex + 1 }),
    });
    const onStructure = jest.fn();
    const onBlock = jest.fn();
    const onElements = jest.fn();
    const onEditor = jest.fn();
    const onSelection = jest.fn();
    panel.subscribe(onEditor);
    panel.selection.subscribe(onSelection);
    panel.blocks.subscribeBlockNode(first.id, onBlock);
    panel.elements.subscribe(onElements);
    panel.elements.subscribeStructure(onStructure);
    await panel.destroy();
    editor.blocks.updateBlock(first.id, { content: "updated" });
    editor.selection.set(createCaretSelection(first.id, 0));
    const second = other.blocks.insertBlock({ type: "paragraph", content: "two" });
    expect(second.content).toBe("two!");
    editor.history.undo();
    expect(editor.blocks.hasBlock(second.id)).toBe(false);
    const element = other.elements.insertElement({
      type: "shape",
      zIndex: 2,
      frame: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(element.zIndex).toBe(3);
    expect(onStructure).not.toHaveBeenCalled();
    expect(onBlock).not.toHaveBeenCalled();
    expect(onElements).not.toHaveBeenCalled();
    expect(onEditor).not.toHaveBeenCalled();
    expect(onSelection).not.toHaveBeenCalled();
    disposeElement();
    dispose();
    expect(other.blocks.insertBlock({ type: "paragraph", content: "three" }).content).toBe("three");
  } finally {
    await editor.destroy();
  }
});

it("borrows selection and history through their public interfaces", async () => {
  const editor = await createTestEditor();
  try {
    const history = new Proxy(editor.history, { getPrototypeOf: () => Object.prototype });
    const selection = new Proxy(editor.selection, { getPrototypeOf: () => Object.prototype });
    const borrowed = new Proxy(editor, {
      /**
       * Exposes interface-only proxies while forwarding other editor members.
       *
       * @param target - Original editor.
       * @param key - Requested editor member.
       * @param receiver - Proxy receiving the read.
       * @returns The requested proxy or the original member.
       */
      get(target, key, receiver) {
        if (key === "history") {
          return history;
        }
        if (key === "selection") {
          return selection;
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const panel = new ChildrenPanel(borrowed);
    expect(panel.history).toBe(history);
    expect(panel.selection.get()).toEqual(selection.get());
    await panel.destroy();
  } finally {
    await editor.destroy();
  }
});

it("edits independent block and element subtrees without React and preserves root protection", async () => {
  const editor = await createTestEditor();
  editor.blocks.insertBlock({
    id: "root",
    type: "paragraph",
    children: [{ id: "child", type: "paragraph" }],
  });
  const frame = { x: 0, y: 0, width: 10, height: 10 };
  editor.elements.insertElement({
    id: "container",
    type: "group",
    frame,
    zIndex: 0,
    children: [{ id: "inside", type: "shape", frame, zIndex: 0 }],
  });
  editor.elements.insertElement({ id: "outside", type: "shape", frame, zIndex: 0 });
  const panel = new ChildrenPanel(editor, { rootBlockId: "root", rootElementId: "container" });
  const embed = new EmbeddingPanel(editor, { rootBlockId: "root" });
  expect(panel.blocks.getRootIds()).toEqual(["child"]);
  expect(embed.blocks.getRootIds()).toEqual(["root"]);
  expect(embed.blocks.canRemove("root")).toBe(false);
  expect(panel.elements.getRootIds()).toEqual(["inside"]);
  expect(panel.elements.getElementNode("outside")).toBeUndefined();
  expect(() => panel.elements.updateElement("outside", { frame: { x: 20 } })).toThrow();
  editor.history.clear();
  panel.elements.updateElement("inside", { frame: { x: 30 } });
  editor.history.undo();
  expect(panel.elements.getElementNode("inside")?.frame.x).toBe(0);
  expect(new ChildrenPanel(editor).blocks.getRootIds()).toEqual(["root"]);
  await editor.destroy();
});

it.each(["children", "embedding"] as const)(
  "shares document history for %s panel batches and excludes maintenance writes",
  async (kind) => {
    const editor = await createTestEditor();
    editor.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph", content: "before" }],
    });
    editor.elements.insertElement({
      id: "element",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    });
    const panel =
      kind === "children"
        ? new ChildrenPanel(editor, { rootBlockId: "root" })
        : new EmbeddingPanel(editor, { rootBlockId: "root" });
    const other = new ChildrenPanel(editor);
    editor.history.clear();
    try {
      const result = panel.batchUpdates(() => {
        panel.blocks.updateBlock("child", { content: "after" });
        return other.batchUpdates(() => {
          panel.elements.updateElement("element", { frame: { x: 30 } });
          return "result";
        });
      });
      expect(result).toBe("result");
      expect(
        panel.batchUpdatesWithoutHistory(() => {
          panel.blocks.setBlockPluginData("child", "maintenance", { value: 1 });
          return 42;
        }),
      ).toBe(42);
      other.document.history.undo();
      expect(panel.blocks.getBlockNode("child")?.content).toBe("before");
      expect(panel.elements.getElementNode("element")?.frame.x).toBe(0);
      expect(panel.blocks.getBlockNode("child")?.pluginData.maintenance).toEqual({ value: 1 });
      editor.history.redo();
      expect(panel.blocks.getBlockNode("child")?.content).toBe("after");
      expect(panel.elements.getElementNode("element")?.frame.x).toBe(30);
      const failure = new Error("callback failure");
      for (const method of ["batchUpdates", "batchUpdatesWithoutHistory"] as const) {
        expect(() =>
          panel[method](() => {
            throw failure;
          }),
        ).toThrow(failure);
        expect(panel[method](() => "still usable")).toBe("still usable");
      }
    } finally {
      await editor.destroy();
    }
  },
);

it.each(["children", "embedding"] as const)(
  "forwards the document change stream and cleanup for a %s panel",
  async (kind) => {
    const editor = await createTestEditor();
    editor.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: [{ id: "inside", type: "paragraph" }],
    });
    editor.blocks.insertBlock({ id: "outside", type: "paragraph" });
    const panel =
      kind === "children"
        ? new ChildrenPanel(editor, { rootBlockId: "root" })
        : new EmbeddingPanel(editor, { rootBlockId: "root" });
    const documentSnapshots: number[] = [];
    const panelSnapshots: number[] = [];
    const stopDocument = editor.subscribe(() => documentSnapshots.push(editor.revision));
    const stopPanel = panel.subscribe(() => panelSnapshots.push(editor.revision));
    try {
      expect(panelSnapshots).toEqual([]);
      panel.blocks.updateBlock("inside", { content: "inside edit" });
      const beforeOutside = panelSnapshots.length;
      editor.blocks.updateBlock("outside", { content: "outside edit" });
      expect(panelSnapshots.length).toBeGreaterThan(beforeOutside);
      expect(panel.blocks.getBlockNode("outside")).toBeUndefined();
      editor.history.undo();
      editor.history.redo();
      expect(panelSnapshots).toEqual(documentSnapshots);
      stopPanel();
      const beforeCleanup = panelSnapshots.length;
      panel.blocks.updateBlock("inside", { content: "after unsubscribe" });
      expect(panelSnapshots).toHaveLength(beforeCleanup);
      expect(documentSnapshots.length).toBeGreaterThan(beforeCleanup);
    } finally {
      stopPanel();
      stopDocument();
      await editor.destroy();
    }
  },
);

it("moves into a hidden panel boundary without permitting moves beside or of that boundary", async () => {
  const editor = await createTestEditor();
  editor.blocks.insertBlock({
    id: "boundary",
    type: "paragraph",
    children: [{ id: "parent", type: "paragraph", children: [{ id: "child", type: "paragraph" }] }],
  });
  editor.blocks.insertBlock({ id: "outside", type: "paragraph" });
  const panel = new ChildrenPanel(editor, { rootBlockId: "boundary" });
  editor.history.clear();
  expect(() => panel.blocks.moveBlocks(["child"], "boundary", "before")).toThrow();
  expect(() => panel.blocks.moveBlocks(["boundary"], "parent", "inside")).toThrow();
  expect(() => panel.blocks.moveBlocks(["child"], "outside", "inside")).toThrow();
  panel.blocks.moveBlocks(["child"], "boundary", "inside");
  expect(panel.blocks.getRootIds()).toEqual(["parent", "child"]);
  editor.history.undo();
  expect(editor.blocks.getChildIds("parent")).toEqual(["child"]);
  await editor.destroy();
});

it("rejects inherited text replacement when a removed block is outside the panel", async () => {
  const editor = await createTestEditor();
  try {
    editor.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: [{ id: "inside", type: "paragraph", content: "before" }],
    });
    editor.blocks.insertBlock({ id: "outside", type: "paragraph", content: "outside" });
    const panel = new ChildrenPanel(editor, { rootBlockId: "root" });
    expect(() => panel.blocks.replaceTextSelection("inside", ["outside"], "after")).toThrow();
    expect(editor.blocks.getBlockNode("inside")?.content).toBe("before");
    expect(editor.blocks.hasBlock("outside")).toBe(true);
  } finally {
    await editor.destroy();
  }
});

it("keeps element reads and writes inside the source panel when panels are nested", async () => {
  const editor = await createTestEditor();
  try {
    const frame = { x: 0, y: 0, width: 10, height: 10 };
    editor.elements.insertElement({
      id: "container",
      type: "group",
      frame,
      zIndex: 0,
      children: [{ id: "inside", type: "shape", frame, zIndex: 0 }],
    });
    editor.elements.insertElement({ id: "outside", type: "shape", frame, zIndex: 0 });
    const outer = new ChildrenPanel(editor, { rootElementId: "container" });
    const inner = new ChildrenPanel(outer);
    expect(inner.rootElementId).toBe("container");
    expect(inner.elements.getRootIds()).toEqual(["inside"]);
    expect(inner.elements.getElementNodes().map((element) => element.id)).toEqual(["inside"]);
    expect(inner.elements.getElementNode("outside")).toBeUndefined();
    const added = inner.elements.insertElement({ type: "shape", frame, zIndex: 0 });
    expect(editor.elements.getParentId(added.id)).toBe("container");
    const sameRoot = new ChildrenPanel(outer, { rootElementId: "container" });
    expect(sameRoot.elements.getRootIds()).toEqual(["inside", added.id]);
    expect(
      editor.elements.getParentId(
        sameRoot.elements.insertElement({ type: "shape", frame, zIndex: 0 }).id,
      ),
    ).toBe("container");
    const outside = new ChildrenPanel(outer, { rootElementId: "outside" });
    expect(outside.elements.getRootIds()).toEqual([]);
    expect(outside.elements.getElements()).toEqual([]);
    expect(() => outside.elements.insertElement({ type: "shape", frame, zIndex: 0 })).toThrow();
  } finally {
    await editor.destroy();
  }
});
