import { ReactPanel } from "./react-panel";
import {
  createCaretSelection,
  createStructuralSelection,
  PasteStrategyRegistry,
} from "@chulane/rivto";
import { convertLeafToContainer } from "../extensions/containers/convert-leaf-to-container";
import { createReactEditor } from "../editor/react-editor";
import { createTestCoreEditor } from "../test-utils";
import { ChildrenPanel } from "@chulane/rivto";
import { EmbeddingPanel } from "@chulane/rivto";
const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

async function fixture() {
  const document = await createTestCoreEditor();
  document.blocks.insertBlock({ id: "outside", type: "paragraph" });
  document.blocks.insertBlock({
    id: "root",
    type: "paragraph",
    content: "Root",
    children: [
      { id: "a", type: "paragraph" },
      { id: "b", type: "paragraph" },
    ],
  });
  const shape = { type: "shape", zIndex: 0, frame: { x: 0, y: 0, width: 10, height: 10 } };
  document.elements.insertElement({
    ...shape,
    id: "container",
    children: [{ ...shape, id: "inside" }],
  });
  document.elements.insertElement({ ...shape, id: "outside-element" });
  const editor = createReactEditor({ editor: document });
  const children = new ReactPanel(
    editor,
    new ChildrenPanel(editor, { rootBlockId: "root", rootElementId: "container" }),
    {},
  );
  const embedding = new ReactPanel(
    editor,
    new EmbeddingPanel(editor, { rootBlockId: "root", rootElementId: "container" }),
    {},
  );
  return {
    document,
    children,
    embedding,
    close: async () => {
      editor.destroy();
      await document.destroy();
    },
  };
}

test("panel roots and parents are relative while document hierarchy stays absolute", async () => {
  const f = await fixture();
  expect(f.children.blocks.getRootIds()).toEqual(["a", "b"]);
  expect(f.embedding.blocks.getRootIds()).toEqual(["root"]);
  expect(f.children.blocks.getBlockNode("root")).toBeUndefined();
  expect(f.children.blocks.getParentId("a")).toBeNull();
  expect(f.embedding.blocks.getParentId("a")).toBe("root");
  expect(f.embedding.blocks.getParentId("root")).toBeNull();
  expect(f.document.blocks.getParentId("a")).toBe("root");
  for (const reactPanel of [f.children, f.embedding]) {
    expect(reactPanel.elements.getRootIds()).toContain("inside");
    expect(reactPanel.elements.getParentId("inside")).toBeNull();
    expect(reactPanel.elements.getElementNode("container")).toBeUndefined();
    expect(reactPanel.elements.getElementNode("outside-element")).toBeUndefined();
    const inserted = reactPanel.elements.insertElement({
      type: "shape",
      zIndex: 1,
      frame: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(f.document.elements.getParentId(inserted.id)).toBe("container");
  }
  await f.close();
});

test("rejects outside targets and protected root operations before any batch mutation", async () => {
  const f = await fixture();
  const before = f.document.dump();
  expect(() => f.children.clipboard.copy(createStructuralSelection(["outside"]))).toThrow();
  expect(() => f.children.clipboard.copyText(createCaretSelection("outside", 0))).toThrow();
  expect(() => f.children.clipboard.copyElements(["outside-element"], f.embedding)).toThrow();
  expect(() =>
    f.children.blocks.updateBlocks([
      { id: "a", patch: { content: "changed" } },
      { id: "outside", patch: { content: "bad" } },
    ]),
  ).toThrow();
  expect(() => f.embedding.blocks.removeBlocks(["a", "root"])).toThrow();
  expect(() => f.embedding.blocks.moveBlocks(["a", "root"], "b")).toThrow();
  expect(() => f.embedding.blocks.mergeBlocks("a", "root")).toThrow();
  expect(() => f.children.blocks.outdentBlocks(["a", "b"])).toThrow();
  expect(() =>
    f.children.blocks.insertBlock({ type: "paragraph" }, { parentId: "outside" }),
  ).toThrow();
  expect(() =>
    f.children.elements.updateElements([
      { id: "inside", patch: { zIndex: 5 } },
      { id: "outside-element", patch: { zIndex: 6 } },
    ]),
  ).toThrow();
  expect(() =>
    f.children.elements.moveElements(["inside"], { parentId: null, beforeId: "outside-element" }),
  ).toThrow();
  expect(() => f.children.elements.removeElements(["inside", "container"])).toThrow();
  expect(f.document.dump()).toEqual(before);
  f.embedding.blocks.updateBlock("root", { content: "Editable root" });
  f.embedding.selection.set(createStructuralSelection(["root"]));
  expect(f.embedding.clipboard.copy()?.blocks[0]?.content).toBe("Editable root");
  f.embedding.selection.delete();
  expect(f.document.blocks.hasBlock("root")).toBe(true);
  f.embedding.selection.set(createCaretSelection("root", 0));
  await f.close();
});

test("direct insertion into an empty panel is observed only under its real parent and is undoable", async () => {
  const f = await fixture();
  f.children.blocks.removeBlocks(["a", "b"]);
  f.document.history.clear();
  const parents: (string | null | undefined)[] = [];
  const stop = f.document.blocks.subscribeStructure(() => {
    if (f.document.blocks.hasBlock("new")) {
      parents.push(f.document.blocks.getParentId("new"));
    }
  });
  f.children.blocks.insertBlock({ id: "new", type: "paragraph" });
  expect(parents.length).toBeGreaterThan(0);
  expect(parents.every((parent) => parent === "root")).toBe(true);
  expect(f.document.blocks.getRootIds()).toEqual(["outside", "root"]);
  f.document.history.undo();
  expect(f.children.blocks.getRootIds()).toEqual([]);
  f.document.history.redo();
  expect(f.children.blocks.getRootIds()).toEqual(["new"]);
  stop();
  await f.close();
});

test("paste keeps protected root text editable and inserts following lines inside the embedding", async () => {
  const f = await fixture();
  const before = f.document.dump();
  expect(() =>
    f.embedding.clipboard.paste({
      text: "bad",
      defaultBlockType: "paragraph",
      placement: { afterId: "outside" },
    }),
  ).toThrow();
  expect(() =>
    f.children.clipboard.paste({
      text: "bad",
      defaultBlockType: "paragraph",
      textTarget: createCaretSelection("outside", 0),
    }),
  ).toThrow();
  expect(f.document.dump()).toEqual(before);
  f.embedding.clipboard.paste({
    text: "First\nSecond",
    defaultBlockType: "paragraph",
    textTarget: createCaretSelection("root", 4),
  });
  expect(f.document.blocks.getBlockNode("root")?.content).toBe("RootFirst");
  expect(f.document.blocks.getRootIds()).toEqual(["outside", "root"]);
  expect(f.document.blocks.getBlock("root")?.children[0]?.content).toBe("Second");
  await f.close();
});

test("pastes into an empty children panel without escaping its root", async () => {
  const f = await fixture();
  f.children.blocks.removeBlocks(["a", "b"]);
  f.document.selection.clear();
  f.children.clipboard.paste({ text: "new", defaultBlockType: "paragraph" });
  expect(f.children.blocks.getBlocks().map((block) => block.content)).toEqual(["new"]);
  expect(f.document.blocks.getRootIds()).toEqual(["outside", "root"]);
  await f.close();
});

test("nested React panels use their own selection with the shared runtime", async () => {
  const f = await fixture();
  f.children.blocks.insertBlock({ id: "nested", type: "paragraph" }, { parentId: "a" });
  const corePanel = new ChildrenPanel(f.children, { rootBlockId: "a" });
  const nested = new ReactPanel(f.children, corePanel);
  const root = {} as HTMLElement;
  jestApi.spyOn(nested, "getRoot").mockReturnValue(root);
  const activeRoot = jestApi.spyOn(nested.editor.panels, "getActiveRoot").mockReturnValue(root);
  try {
    expect(nested.editor).toBe(f.children.editor);
    nested.selection.set(createCaretSelection("nested", 0));
    expect(nested.selection.get()?.blocks[0]?.id).toBe("nested");
    expect(corePanel.selection.get()?.blocks[0]?.id).toBe("nested");
    expect(f.children.selection.get()).toBeUndefined();

    const clipboard = nested.editor.clipboard;
    const nestedSelection = createStructuralSelection(["nested"]);
    f.document.selection.set(createStructuralSelection(["outside"]));
    expect(clipboard.cut(undefined, nested)).toBeUndefined();
    expect(nested.clipboard.cut()).toBeUndefined();
    expect(() => nested.clipboard.cut(createStructuralSelection(["outside"]))).toThrow(
      "Clipboard selection is outside panel",
    );
    expect(f.document.blocks.hasBlock("outside")).toBe(true);
    expect(nested.clipboard.cut(nestedSelection)?.blocks.map(({ id }) => id)).toEqual(["nested"]);
    expect(f.document.blocks.hasBlock("nested")).toBe(false);
    expect(f.document.blocks.hasBlock("outside")).toBe(true);

    f.document.history.undo();
    nested.selection.set(nestedSelection);
    expect(nested.clipboard.cut()?.blocks.map(({ id }) => id)).toEqual(["nested"]);
    expect(f.document.blocks.hasBlock("nested")).toBe(false);
  } finally {
    activeRoot.mockRestore();
    await nested.destroy();
    await corePanel.destroy();
    await f.close();
  }
});

test("panel registrations remain shared after the registering occurrence closes", async () => {
  const f = await fixture();
  const run = jestApi.fn();
  const dispose = f.children.slashCommands.register({
    id: "panel-registration-test",
    title: "Panel registration",
    execute: run,
  });
  try {
    expect(f.embedding.slashCommands.get("panel-registration-test")).toBeDefined();
    expect(f.children.clipboard.pasteStrategies).toBe(f.embedding.clipboard.pasteStrategies);
    await f.children.destroy();
    f.embedding.slashCommands.execute("panel-registration-test", { blockId: "a" });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ reactPanel: f.embedding }));
    dispose();
    expect(f.embedding.slashCommands.get("panel-registration-test")).toBeUndefined();
  } finally {
    dispose();
    await f.embedding.destroy();
    await f.close();
  }
});

test("panel paste uses live shared strategies without copying registrations", async () => {
  const f = await fixture();
  const seen = jestApi.fn();
  const dispose = f.document.clipboard.pasteStrategies.register("panel-observer", {
    matches: () => true,
    paste: (context) => {
      seen(context.editor);
      return undefined;
    },
  });
  const register = jestApi.spyOn(PasteStrategyRegistry.prototype, "register");
  try {
    f.children.clipboard.paste({ text: "new", defaultBlockType: "paragraph" });
    expect(seen).toHaveBeenCalledWith(f.children);
    expect(register).not.toHaveBeenCalled();
    dispose();
    seen.mockClear();
    f.children.clipboard.paste({ text: "again", defaultBlockType: "paragraph" });
    expect(seen).not.toHaveBeenCalled();
  } finally {
    register.mockRestore();
    dispose();
    await f.close();
  }
});

test("prepending a nested block keeps its sibling list and the protected root cannot be cut", async () => {
  const f = await fixture();
  f.embedding.blocks.insertBlock({ id: "grandchild", type: "paragraph" }, { parentId: "a" });
  f.embedding.blocks.insertBlock({ id: "second-grandchild", type: "paragraph" }, { parentId: "a" });
  f.embedding.blocks.moveBlock("second-grandchild", null);
  expect(f.document.blocks.getChildIds("a")).toEqual(["second-grandchild", "grandchild"]);
  expect(f.document.blocks.getParentId("second-grandchild")).toBe("a");
  f.embedding.selection.set(createStructuralSelection(["root"]));
  f.embedding.clipboard.cut();
  expect(f.document.blocks.getBlockNode("root")?.content).toBe("Root");
  await f.close();
});

test("container conversion preserves the protected root identity without a sibling insertion", async () => {
  const f = await fixture();
  f.embedding.blocks.removeBlocks(["a", "b"]);
  f.document.blockRegistry.defineBlock({ type: "container" });
  f.document.history.clear();
  convertLeafToContainer(f.embedding, "root", {
    type: "container",
    children: [{ id: "shell", type: "paragraph" }],
  });
  expect(f.document.blocks.getRootIds()).toEqual(["outside", "root"]);
  expect(f.embedding.blocks.getBlock("root")).toMatchObject({
    id: "root",
    type: "container",
    content: "Root",
    children: [{ id: "shell" }],
  });
  f.document.history.undo();
  expect(f.embedding.blocks.getBlock("root")).toMatchObject({
    id: "root",
    type: "paragraph",
    children: [],
  });
  await f.close();
});

test("structural selection deletion uses panel behavior context and undoes blocks and elements together", async () => {
  const f = await fixture();
  try {
    let reject = true;
    f.document.blockRegistry.registerBehavior({
      isAvailable: (block) => block.id === "a",
      onStructuralDelete: (context) => {
        expect(context.blocks).toBe(f.children.blocks);
        expect(context.parentId).toBeNull();
        return reject ? "rejected" : "unhandled";
      },
    });
    const selection = { ...createStructuralSelection(["a"]), elements: ["inside"] };
    f.children.selection.set(selection);
    f.document.history.clear();
    f.children.selection.delete();
    expect(f.document.blocks.hasBlock("a")).toBe(true);
    expect(f.document.elements.hasElement("inside")).toBe(true);
    expect(f.children.selection.get()).toEqual(f.document.selection.get());
    expect(f.children.selection.get()?.blocks.map(({ id }) => id)).toEqual(["a"]);
    reject = false;
    f.children.selection.delete();
    expect(f.document.blocks.hasBlock("a")).toBe(false);
    expect(f.document.elements.hasElement("inside")).toBe(false);
    expect(f.document.selection.get()).toBeUndefined();
    f.document.history.undo();
    expect(f.document.blocks.hasBlock("a")).toBe(true);
    expect(f.document.elements.hasElement("inside")).toBe(true);
  } finally {
    await f.close();
  }
});
