import { createTestEditor as createRivtoEditor } from "../test-utils";
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import { createRivtoEditor as createCoreEditor } from "../rivto-editor";
import { createStructuralSelection } from "../../managers/selection-manager";

describe("EditorRuntime methods", () => {
  it("attaches its first document only through setDocument", async () => {
    const editor = createCoreEditor();
    const document = new DocumentModelImpl(new YjsDoc("editor-first-document"));
    let roots = 0;
    let elements = 0;
    editor.blocks.subscribeRootIds(() => { roots += 1; });
    editor.elements.subscribe(() => { elements += 1; });
    editor.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    editor.blocks.registerProcessor({
      id: "test.first-document",
      priority: 0,
      processor: (block) => ({ ...block, props: { ...block.props, attached: true } }),
    });

    expect(editor.getDocument()).toBeUndefined();
    expect(() => editor.dump()).toThrow("Document is not set");
    editor.mode.set("edgeless");

    editor.setDocument(document);

    expect(editor.getDocument()).toBe(document);
    expect(roots).toBe(1);
    expect(elements).toBe(1);
    const id = editor.blocks.insertBlock({ type: "paragraph" });
    expect(editor.blocks.getBlock(id)?.props).toMatchObject({ attached: true });
    await editor.destroy();
    await document.destroy();
  });

  it("exposes manager capabilities without duplicate forwarding methods", () => {
    type RemovedEditorMethods = Extract<
      "register" | "execute" | "removeCommand" | "deleteSelection" | "undo" | "redo"
      | "batchUpdates" | "batchUpdatesWithoutHistory",
      keyof ReturnType<typeof createRivtoEditor>
    >;
    const noRemovedMethods: Record<RemovedEditorMethods, never> = {};
    const editor = createRivtoEditor();

    expect(noRemovedMethods).toEqual({});
    expect(editor).not.toHaveProperty("register");
    expect(editor).not.toHaveProperty("execute");
    expect(editor).not.toHaveProperty("removeCommand");
    expect(editor).not.toHaveProperty("deleteSelection");
    expect(editor).not.toHaveProperty("undo");
    expect(editor).not.toHaveProperty("redo");
    expect(editor).not.toHaveProperty("batchUpdates");
    expect(editor).not.toHaveProperty("batchUpdatesWithoutHistory");
    editor.destroy();
  });

  it("supports a complete lifecycle without blocks", () => {
    const editor = createRivtoEditor();

    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.blocks.getRootIds()).toEqual([]);
    expect(editor.selection.get()).toBeUndefined();
    expect(editor.dump()).toMatchObject({ version: 6, blocks: [] });

    editor.selection.delete();
    editor.history.undo();
    editor.history.redo();
    expect(editor.blocks.getBlocks()).toEqual([]);

    const id = editor.history.batchUpdates(() => editor.blocks.insertBlock({ type: "paragraph", content: "Created later" }));
    editor.blocks.removeBlock(id);
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.history.undo();
    expect(editor.blocks.getBlock(id)?.content).toBe("Created later");
    editor.history.redo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("leaves the caller-owned document alive after runtime destruction", async () => {
    const document = new DocumentModelImpl(new YjsDoc("editor-lifecycle"));
    const destroy = jest.spyOn(document, "destroy");
    const editor = createCoreEditor();
    editor.setDocument(document);

    await editor.destroy();

    expect(destroy).not.toHaveBeenCalled();
    await document.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("switches documents while retaining subscriptions, processors, and manager identity", async () => {
    const first = new DocumentModelImpl(new YjsDoc("editor-swap-first"));
    const second = new DocumentModelImpl(new YjsDoc("editor-swap-second"));
    first.blocks.insertBlock({ id: "shared", type: "paragraph", content: "First" });
    second.blocks.insertBlock({ id: "shared", type: "paragraph", content: "Second" });
    second.elements.insertElement({
      id: "shape",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    });
    const editor = createCoreEditor();
    editor.setDocument(first);
    editor.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    const blocks = editor.blocks;
    const elements = editor.elements;
    const calls = { editor: 0, block: 0, roots: 0, structure: 0, elements: 0, element: 0, membership: 0 };
    const disposers = [
      editor.subscribe(() => { calls.editor += 1; }),
      editor.blocks.subscribeBlock("shared", () => { calls.block += 1; }),
      editor.blocks.subscribeRootIds(() => { calls.roots += 1; }),
      editor.blocks.subscribeStructure(() => { calls.structure += 1; }),
      editor.elements.subscribe(() => { calls.elements += 1; }),
      editor.elements.subscribeElement("shape", () => { calls.element += 1; }),
      editor.elements.subscribeMembership(() => { calls.membership += 1; }),
    ];
    editor.blocks.registerProcessor({
      id: "test.swap",
      priority: 0,
      processor: (block) => ({ ...block, props: { ...block.props, swapped: true } }),
    });
    editor.elements.registerProcessor({
      id: "test.swap.element",
      priority: 0,
      processor: (element) => ({ ...element, props: { ...element.props, swapped: true } }),
    });
    editor.selection.set(createStructuralSelection(["shared"]));

    editor.setDocument(second);

    expect(editor.getDocument()).toBe(second);
    expect(editor.blocks).toBe(blocks);
    expect(editor.elements).toBe(elements);
    expect(editor.blocks.getBlock("shared")?.content).toBe("Second");
    expect(editor.selection.get()).toBeUndefined();
    expect(calls).toEqual({ editor: 1, block: 1, roots: 1, structure: 1, elements: 1, element: 1, membership: 1 });

    first.blocks.updateBlock("shared", { content: "Detached" });
    expect(calls).toEqual({ editor: 1, block: 1, roots: 1, structure: 1, elements: 1, element: 1, membership: 1 });

    second.blocks.updateBlock("shared", { content: "Active" });
    expect(editor.blocks.getBlock("shared")?.content).toBe("Active");
    expect(calls.block).toBe(2);
    expect(calls.editor).toBe(2);
    editor.elements.updateElement("shape", { props: { active: true } });
    expect(editor.elements.getElement("shape")?.props).toMatchObject({ active: true });
    expect(calls.element).toBe(2);
    editor.elements.insertElement({
      id: "processed-shape",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 1,
    });
    expect(editor.elements.getElement("processed-shape")?.props).toMatchObject({ swapped: true });

    const inserted = editor.blocks.insertBlock({ type: "paragraph", content: "Processed" });
    expect(editor.blocks.getBlock(inserted)?.props).toMatchObject({ swapped: true });
    editor.history.undo();
    expect(editor.blocks.getBlock(inserted)).toBeUndefined();
    expect(first.blocks.getBlock("shared")?.content).toBe("Detached");

    editor.setDocument(first);
    editor.setDocument(second);
    const afterRoundTrip = editor.blocks.insertBlock({ type: "paragraph" });
    expect(editor.blocks.getBlock(afterRoundTrip)?.props).toMatchObject({ swapped: true });

    const callsBeforeNoop = { ...calls };
    editor.setDocument(second);
    expect(calls).toEqual(callsBeforeNoop);

    disposers.forEach((dispose) => dispose());
    await editor.destroy();
    await first.destroy();
    await second.destroy();
  });

  it("keeps each shared-document editor's processors independent through destruction", async () => {
    const document = new DocumentModelImpl(new YjsDoc("shared-editor-processors"));
    const first = createCoreEditor();
    const second = createCoreEditor();
    first.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    second.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    first.setDocument(document);
    second.setDocument(document);
    const disposeFirstBlock = first.blocks.registerProcessor({
      id: "test.shared.block",
      priority: 0,
      processor: (block) => ({ ...block, props: { ...block.props, owner: "first" } }),
    });
    const disposeSecondBlock = second.blocks.registerProcessor({
      id: "test.shared.block",
      priority: 0,
      processor: (block) => ({ ...block, props: { ...block.props, owner: "second" } }),
    });
    const disposeFirstElement = first.elements.registerProcessor({
      id: "test.shared.element",
      priority: 0,
      processor: (element) => ({ ...element, props: { ...element.props, owner: "first" } }),
    });
    const disposeSecondElement = second.elements.registerProcessor({
      id: "test.shared.element",
      priority: 0,
      processor: (element) => ({ ...element, props: { ...element.props, owner: "second" } }),
    });

    const whileBoth = first.blocks.insertBlock({ type: "paragraph" });
    expect(document.blocks.getBlock(whileBoth)?.props).toMatchObject({ owner: "first" });
    second.elements.insertElement({
      id: "while-both",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    });
    expect(document.elements.getElement("while-both")?.props).toMatchObject({ owner: "second" });
    second.blocks.updateBlock(whileBoth, { props: { owner: "input", updated: true } });
    expect(document.blocks.getBlock(whileBoth)?.props).toMatchObject({ owner: "second", updated: true });
    first.elements.updateElement("while-both", { props: { owner: "input", updated: true } });
    expect(document.elements.getElement("while-both")?.props).toMatchObject({ owner: "first", updated: true });

    first.load({
      version: 6,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        listProps: {},
        props: {},
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
      elements: [{
        id: "loaded-element",
        type: "shape",
        frame: { x: 0, y: 0, width: 10, height: 10 },
        zIndex: 0,
        props: {},
      }],
    });
    expect(document.blocks.getBlock("loaded")?.props).toMatchObject({ owner: "first" });
    expect(document.elements.getElement("loaded-element")?.props).toMatchObject({ owner: "first" });

    await second.destroy();

    const afterSecondDestroy = first.blocks.insertBlock({ type: "paragraph" });
    expect(document.blocks.getBlock(afterSecondDestroy)?.props).toMatchObject({ owner: "first" });
    first.elements.insertElement({
      id: "after-second-destroy",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 1,
    });
    expect(document.elements.getElement("after-second-destroy")?.props).toMatchObject({ owner: "first" });

    disposeFirstBlock();
    disposeSecondBlock();
    disposeFirstElement();
    disposeSecondElement();
    await first.destroy();
    await document.destroy();
  });

  it("unregisters each shared-document processor owner independently", async () => {
    const document = new DocumentModelImpl(new YjsDoc("shared-editor-unregister"));
    const first = createCoreEditor();
    const second = createCoreEditor();
    first.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    second.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    first.setDocument(document);
    second.setDocument(document);
    const disposeFirstBlock = first.blocks.registerProcessor({
      id: "test.shared.unregister.block",
      priority: 0,
      processor: (block) => ({ ...block, props: { ...block.props, owner: "first" } }),
    });
    const disposeSecondBlock = second.blocks.registerProcessor({
      id: "test.shared.unregister.block",
      priority: 0,
      processor: (block) => ({ ...block, props: { ...block.props, owner: "second" } }),
    });
    const disposeFirstElement = first.elements.registerProcessor({
      id: "test.shared.unregister.element",
      priority: 0,
      processor: (element) => ({ ...element, props: { ...element.props, owner: "first" } }),
    });
    const disposeSecondElement = second.elements.registerProcessor({
      id: "test.shared.unregister.element",
      priority: 0,
      processor: (element) => ({ ...element, props: { ...element.props, owner: "second" } }),
    });

    document.blocks.insertBlock({ id: "direct-while-registered", type: "paragraph" });
    document.elements.insertElement({
      id: "direct-element-while-registered",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    });
    expect(document.blocks.getBlock("direct-while-registered")?.props).not.toHaveProperty("owner");
    expect(document.elements.getElement("direct-element-while-registered")?.props).not.toHaveProperty("owner");

    const firstBlock = first.blocks.insertBlock({ type: "paragraph" });
    const secondBlock = second.blocks.insertBlock({ type: "paragraph" });
    first.elements.insertElement({
      id: "first-element",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    });
    second.elements.insertElement({
      id: "second-element",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 1,
    });
    expect(document.blocks.getBlock(firstBlock)?.props).toMatchObject({ owner: "first" });
    expect(document.blocks.getBlock(secondBlock)?.props).toMatchObject({ owner: "second" });
    expect(document.elements.getElement("first-element")?.props).toMatchObject({ owner: "first" });
    expect(document.elements.getElement("second-element")?.props).toMatchObject({ owner: "second" });

    disposeFirstBlock();
    disposeFirstElement();
    const firstUnregistered = first.blocks.insertBlock({ type: "paragraph" });
    const secondStillRegistered = second.blocks.insertBlock({ type: "paragraph" });
    first.elements.insertElement({
      id: "first-unregistered-element",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 2,
    });
    expect(document.blocks.getBlock(firstUnregistered)?.props).not.toHaveProperty("owner");
    expect(document.blocks.getBlock(secondStillRegistered)?.props).toMatchObject({ owner: "second" });
    expect(document.elements.getElement("first-unregistered-element")?.props).not.toHaveProperty("owner");

    disposeSecondBlock();
    disposeSecondElement();
    const secondUnregistered = second.blocks.insertBlock({ type: "paragraph" });
    second.elements.insertElement({
      id: "unowned-element",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 3,
    });
    document.blocks.insertBlock({ id: "direct-document-block", type: "paragraph" });
    expect(document.blocks.getBlock(secondUnregistered)?.props).not.toHaveProperty("owner");
    expect(document.elements.getElement("unowned-element")?.props).not.toHaveProperty("owner");
    expect(document.blocks.getBlock("direct-document-block")?.props).not.toHaveProperty("owner");

    await first.destroy();
    await second.destroy();
    await document.destroy();
  });

  it("keeps shared reads, history, selection, and subscriptions isolated across one editor swap", async () => {
    const shared = new DocumentModelImpl(new YjsDoc("shared-editor-runtime"));
    const alternate = new DocumentModelImpl(new YjsDoc("shared-editor-alternate"));
    shared.blocks.insertBlock({ id: "shared", type: "paragraph", content: "Initial" });
    alternate.blocks.insertBlock({ id: "alternate", type: "paragraph", content: "Alternate" });
    const first = createCoreEditor();
    const second = createCoreEditor();
    first.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    second.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    first.setDocument(shared);
    second.setDocument(shared);
    const calls = { first: 0, second: 0 };
    first.blocks.subscribeBlock("shared", () => { calls.first += 1; });
    second.blocks.subscribeBlock("shared", () => { calls.second += 1; });

    first.selection.set(createStructuralSelection(["shared"]));
    expect(second.selection.get()).toBeUndefined();
    second.blocks.updateBlock("shared", { content: "From second" });
    expect(first.blocks.getBlock("shared")?.content).toBe("From second");
    expect(calls).toEqual({ first: 1, second: 1 });

    first.history.stopCapturing();
    first.blocks.updateBlock("shared", { content: "Undo me" });
    second.history.undo();
    expect(first.blocks.getBlock("shared")?.content).toBe("From second");

    first.setDocument(alternate);
    expect(first.selection.get()).toBeUndefined();
    const callsAfterSwap = { ...calls };
    second.blocks.updateBlock("shared", { content: "Second only" });
    expect(calls.first).toBe(callsAfterSwap.first);
    expect(calls.second).toBe(callsAfterSwap.second + 1);
    expect(first.blocks.getBlock("alternate")?.content).toBe("Alternate");

    first.blocks.updateBlock("alternate", { content: "First only" });
    expect(second.blocks.getBlock("shared")?.content).toBe("Second only");
    await first.destroy();
    await second.destroy();
    await shared.destroy();
    await alternate.destroy();
  });

  it("mutates blocks through the focused block manager", () => {
    const editor = createRivtoEditor();

    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId);

    editor.blocks.updateBlock(firstId, { content: "First updated" });
    editor.blocks.setBlockProp(firstId, "tone", "info");
    editor.blocks.setBlockPluginData(firstId, "test", { seen: true });
    editor.blocks.indentBlock(secondId);

    expect(editor.blocks.getBlocks()).toMatchObject([
      {
        id: firstId,
        content: "First updated",
        props: { tone: "info" },
        pluginData: { test: { seen: true } },
        children: [{ id: secondId, content: "Second" }],
      },
    ]);

    editor.blocks.outdentBlock(secondId);
    editor.blocks.moveBlock(secondId, null);

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([secondId, firstId]);

    editor.blocks.removeBlock(secondId);

    expect(editor.blocks.getBlocks().map((block) => block.id)).toEqual([firstId]);
    editor.destroy();
  });

  it("loads and dumps snapshots through editor methods", () => {
    const editor = createRivtoEditor();

    editor.load({
      version: 6,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        listProps: { collapsed: false, type: "list", checked: false },
        props: { tone: "success" },
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
      pluginData: { app: { theme: "dark" } },
    });

    expect(editor.dump()).toMatchObject({
      version: 6,
      blocks: [{
        id: "loaded",
        content: "Loaded",
        listProps: { type: "list", checked: false },
        props: { tone: "success" },
      }],
      pluginData: { app: { theme: "dark" } },
    });

    editor.load({ version: 6, blocks: [] });
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.dump()).toMatchObject({ version: 6, blocks: [] });
    editor.destroy();
  });
});
