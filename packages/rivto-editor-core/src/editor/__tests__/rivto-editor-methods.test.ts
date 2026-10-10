import { createTestEditor as createRivtoEditor } from "../test-utils";
import { YjsDoc, YjsDocumentRegistry } from "@chulane/crdt-doc";
import { DocumentModelImpl, DocumentStorage } from "@chulane/document-model";
import { createRivtoEditor as createCoreEditor } from "../rivto-editor";
import { createStructuralSelection } from "../../managers/selection-manager";

describe("EditorRuntime methods", () => {
  it("requires one fixed document and leaves other documents untouched", async () => {
    const document = new DocumentModelImpl(new YjsDoc("fixed"));
    const editor = createCoreEditor({ document });
    expect(() => createCoreEditor({} as never)).toThrow("Document is required");
    expect(editor).not.toHaveProperty("setDocument");
    expect(editor).not.toHaveProperty("documents");
    expect(editor.mode.get()).toBe("block");
    editor.blockRegistry.defineBlock({ type: "paragraph" });
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Fixed" }).id;
    expect(editor.getDocument()).toBe(document);
    expect(editor.blocks.getBlockNode(id)?.content).toBe("Fixed");
    await editor.destroy(); await document.destroy();
  });

  it("exposes manager capabilities without duplicate forwarding methods", async () => {
    type RemovedEditorMethods = Extract<
      "register" | "execute" | "removeCommand" | "deleteSelection" | "undo" | "redo"
      | "batchUpdates" | "batchUpdatesWithoutHistory",
      keyof Awaited<ReturnType<typeof createRivtoEditor>>
    >;
    const noRemovedMethods: Record<RemovedEditorMethods, never> = {};
    const editor = await createRivtoEditor();

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

  it("supports a complete lifecycle without blocks", async () => {
    const editor = await createRivtoEditor();

    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.blocks.getRootIds()).toEqual([]);
    expect(editor.selection.get()).toBeUndefined();
    expect(editor.dump()).toMatchObject({ version: 6, blocks: [] });

    editor.selection.delete();
    editor.history.undo();
    editor.history.redo();
    expect(editor.blocks.getBlocks()).toEqual([]);

    const id = editor.history.batchUpdates(() => editor.blocks.insertBlock({ type: "paragraph", content: "Created later" })).id;
    editor.blocks.removeBlock(id);
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.history.undo();
    expect(editor.blocks.getBlockNode(id)?.content).toBe("Created later");
    editor.history.redo();
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("leaves the caller-owned model alive after single editor destruction", async () => {
    const document = new DocumentModelImpl(new YjsDoc("caller-owned"));
    const destroy = jest.spyOn(document, "destroy");
    const editor = createCoreEditor({ document });
    await editor.destroy();
    expect(destroy).not.toHaveBeenCalled();
    document.blocks.insertBlock({ id: "after", type: "unknown", props: { arbitrary: true } });
    expect(document.blocks.hasBlock("after")).toBe(true);
    await document.destroy(); expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps subscriptions, callbacks, and processors independent across documents", async () => {
    const a = new DocumentModelImpl(new YjsDoc("A")); const b = new DocumentModelImpl(new YjsDoc("B"));
    const first = createCoreEditor({ document: a }); const second = createCoreEditor({ document: b });
    for (const editor of [first, second]) { editor.blockRegistry.defineBlock({ type: "paragraph" }); editor.blocks.insertBlock({ id: "shared", type: "paragraph", content: editor.getDocument().id }); }
    const calls = { first: 0, second: 0, element: 0 };
    first.blocks.subscribeBlockNode("shared", () => { calls.first += 1; });
    second.blocks.subscribeBlockNode("shared", () => { calls.second += 1; });
    first.elements.subscribe(() => { calls.element += 1; });
    first.blocks.registerProcessor({ id: "shared.processor", priority: 0, processor: (block) => ({ ...block, props: { ...block.props, processed: true } }) });
    const update = first.blocks.updateBlock.bind(first.blocks);
    await Promise.resolve(); update("shared", { content: "Edited A", props: { processed: false } });
    expect(first.blocks.getBlockNode("shared")?.props.processed).toBe(true);
    expect(second.blocks.getBlockNode("shared")?.content).toBe("B");
    expect(calls).toEqual({ first: 1, second: 0, element: 0 });
    second.elements.insertElement({ id: "other", type: "shape", frame: { x: 0, y: 0, width: 10, height: 10 }, zIndex: 0 });
    expect(calls.element).toBe(0);
    first.history.undo(); expect(first.blocks.getBlockNode("shared")?.content).toBe("A");
    let updates = 0; first.subscribe(() => { updates += 1; });
    await first.destroy(); a.blocks.updateBlock("shared", { content: "After destruction" });
    expect(updates).toBe(0);
    await second.destroy(); await a.destroy(); await b.destroy();
  });

  it("keeps each shared-document editor's processors independent through destruction", async () => {
    const document = new DocumentModelImpl(new YjsDoc("shared-editor-processors"));
    const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
    const first = createCoreEditor({ document });
    const second = createCoreEditor({ document });
    first.blockRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    second.blockRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
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

    const whileBoth = first.blocks.insertBlock({ type: "paragraph" }).id;
    expect(document.blocks.getBlockNode(whileBoth)?.props).toMatchObject({ owner: "first" });
    second.elements.insertElement({
      id: "while-both",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
    });
    expect(document.elements.getElement("while-both")?.props).toMatchObject({ owner: "second" });
    second.blocks.updateBlock(whileBoth, { props: { owner: "input", updated: true } });
    expect(document.blocks.getBlockNode(whileBoth)?.props).toMatchObject({ owner: "second", updated: true });
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
    expect(document.blocks.getBlockNode("loaded")?.props).toEqual({});
    expect(document.elements.getElement("loaded-element")?.props).toEqual({});

    await second.destroy();

    const afterSecondDestroy = first.blocks.insertBlock({ type: "paragraph" }).id;
    expect(document.blocks.getBlockNode(afterSecondDestroy)?.props).toMatchObject({ owner: "first" });
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
    await document.destroy(); await storage.destroy();
  });

  it("unregisters each shared-document processor owner independently", async () => {
    const document = new DocumentModelImpl(new YjsDoc("shared-editor-unregister"));
    const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
    const first = createCoreEditor({ document });
    const second = createCoreEditor({ document });
    first.blockRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    second.blockRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
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
    expect(document.blocks.getBlockNode("direct-while-registered")?.props).not.toHaveProperty("owner");
    expect(document.elements.getElement("direct-element-while-registered")?.props).not.toHaveProperty("owner");

    const firstBlock = first.blocks.insertBlock({ type: "paragraph" }).id;
    const secondBlock = second.blocks.insertBlock({ type: "paragraph" }).id;
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
    expect(document.blocks.getBlockNode(firstBlock)?.props).toMatchObject({ owner: "first" });
    expect(document.blocks.getBlockNode(secondBlock)?.props).toMatchObject({ owner: "second" });
    expect(document.elements.getElement("first-element")?.props).toMatchObject({ owner: "first" });
    expect(document.elements.getElement("second-element")?.props).toMatchObject({ owner: "second" });

    disposeFirstBlock();
    disposeFirstElement();
    const firstUnregistered = first.blocks.insertBlock({ type: "paragraph" }).id;
    const secondStillRegistered = second.blocks.insertBlock({ type: "paragraph" }).id;
    first.elements.insertElement({
      id: "first-unregistered-element",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 2,
    });
    expect(document.blocks.getBlockNode(firstUnregistered)?.props).not.toHaveProperty("owner");
    expect(document.blocks.getBlockNode(secondStillRegistered)?.props).toMatchObject({ owner: "second" });
    expect(document.elements.getElement("first-unregistered-element")?.props).not.toHaveProperty("owner");

    disposeSecondBlock();
    disposeSecondElement();
    const secondUnregistered = second.blocks.insertBlock({ type: "paragraph" }).id;
    second.elements.insertElement({
      id: "unowned-element",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 3,
    });
    document.blocks.insertBlock({ id: "direct-document-block", type: "paragraph" });
    expect(document.blocks.getBlockNode(secondUnregistered)?.props).not.toHaveProperty("owner");
    expect(document.elements.getElement("unowned-element")?.props).not.toHaveProperty("owner");
    expect(document.blocks.getBlockNode("direct-document-block")?.props).not.toHaveProperty("owner");

    await first.destroy();
    await second.destroy();
    await document.destroy(); await storage.destroy();
  });

  it("keeps shared reads, history, selection, and subscriptions isolated while another document is used", async () => {
    const shared = new DocumentModelImpl(new YjsDoc("shared-editor-runtime"));
    const alternate = new DocumentModelImpl(new YjsDoc("shared-editor-alternate"));
    shared.blocks.insertBlock({ id: "shared", type: "paragraph", content: "Initial" });
    alternate.blocks.insertBlock({ id: "alternate", type: "paragraph", content: "Alternate" });
    const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
    const first = createCoreEditor({ document: shared });
    const second = createCoreEditor({ document: shared });
    first.blockRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    second.blockRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
    const calls = { first: 0, second: 0 };
    first.blocks.subscribeBlock("shared", () => { calls.first += 1; });
    second.blocks.subscribeBlock("shared", () => { calls.second += 1; });

    first.selection.set(createStructuralSelection(["shared"]));
    expect(second.selection.get()).toBeUndefined();
    second.blocks.updateBlock("shared", { content: "From second" });
    expect(first.blocks.getBlockNode("shared")?.content).toBe("From second");
    expect(calls).toEqual({ first: 1, second: 1 });

    first.history.stopCapturing();
    first.blocks.updateBlock("shared", { content: "Undo me" });
    second.history.undo();
    expect(first.blocks.getBlockNode("shared")?.content).toBe("From second");

    const alternateView = createCoreEditor({ document: alternate });
    first.selection.clear();
    expect(first.selection.get()).toBeUndefined();
    const callsAfterSwap = { ...calls };
    second.blocks.updateBlock("shared", { content: "Second only" });
    expect(calls.first).toBe(callsAfterSwap.first + 1);
    expect(calls.second).toBe(callsAfterSwap.second + 1);
    expect(alternateView.blocks.getBlockNode("alternate")?.content).toBe("Alternate");

    alternateView.blocks.updateBlock("alternate", { content: "First only" });
    expect(second.blocks.getBlockNode("shared")?.content).toBe("Second only");
    await first.destroy();
    await second.destroy();
    await shared.destroy();
    await alternateView.destroy(); await alternate.destroy(); await storage.destroy();
  });

  it("mutates blocks through the focused block manager", async () => {
    const editor = await createRivtoEditor();

    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId).id;

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

  it("loads and dumps snapshots through editor methods", async () => {
    const editor = await createRivtoEditor();

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
