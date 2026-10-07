const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import { DocumentModelImpl } from "@chulane/document-model";
import { YjsDoc } from "@chulane/crdt-doc";
import { z } from "zod";
import { EditorStorage } from "./editor-storage";
import { createReactEditor } from "./react-editor";
import { crossDocumentBlockTransfer } from "./extensions/built-ins/clipboard/cross-document-block-transfer";
import type { RivtoEditorApi } from "@chulane/rivto";
import { createCaretSelection, createStructuralSelection } from "@chulane/rivto";

const model = (id: string) => new DocumentModelImpl(new YjsDoc(id));
const configured = (editor: RivtoEditorApi) => {
  editor.blockRegistry.defineBlock({ type: "paragraph" });
  return createReactEditor({ editor });
};

it("creates empty documents by default and returns the same single editor for concurrent requests", async () => {
  const multi = new EditorStorage();
  const [a, b] = await Promise.all([multi.getSingleEditor("A"), multi.getSingleEditor("A")]);
  expect(a).toBe(b); expect(a.getDocument().id).toBe("A");
  expect(a.blocks.getBlocks()).toEqual([]); expect(a).not.toHaveProperty("documents"); expect(a.mode.get()).toBe("block");
  const destroy = jestApi.spyOn(a.getDocument(), "destroy");
  const coreDestroy = jestApi.spyOn(a, "destroy");
  const reactEditor = multi.getEditor("A")!;
  const reactDestroy = jestApi.spyOn(reactEditor, "destroy");
  expect(reactEditor.blocks).toBe(a.blocks);
  expect(reactEditor).not.toHaveProperty("getSingleEditor");
  await multi.closeEditor("A");
  expect(reactDestroy).toHaveBeenCalledTimes(1); expect(coreDestroy).toHaveBeenCalledTimes(1);
  expect(reactDestroy.mock.invocationCallOrder[0]).toBeLessThan(coreDestroy.mock.invocationCallOrder[0]!);
  expect(coreDestroy.mock.invocationCallOrder[0]).toBeLessThan(destroy.mock.invocationCallOrder[0]!);
  expect(destroy).toHaveBeenCalledTimes(1); expect(multi.getEditors()).toEqual([]);
  await multi.destroy();
});

it("runs the async loader and specific factory once, preserving per-document defaults and commands", async () => {
  const open = jestApi.fn(async (id: string) => model(id));
  const multi = new EditorStorage({ openDocument: open, createEditor: (editor) => {
    const document = editor.getDocument();
    editor.blockRegistry.defineBlock({ type: "paragraph", defaultProps: { owner: document.id }, propSchema: z.object({ owner: z.string() }) });
    editor.commands.register("identity", () => document.id);
    return createReactEditor({ editor });
  } });
  const [a, same] = await Promise.all([multi.getSingleEditor("A"), multi.getSingleEditor("A")]);
  const b = await multi.getSingleEditor("B");
  expect(a).toBe(same); expect(open.mock.calls.map(([id]) => id)).toEqual(["A", "B"]);
  expect(a.blocks.insertBlock({ type: "paragraph" }).props.owner).toBe("A");
  expect(b.blocks.insertBlock({ type: "paragraph" }).props.owner).toBe("B");
  expect(a.commands.execute("identity")).toBe("A"); expect(b.commands.execute("identity")).toBe("B");
  expect(() => a.blocks.insertBlock({ type: "paragraph", props: { owner: 12 } })).toThrow();
  a.getDocument().blocks.insertBlock({ type: "unregistered", props: { owner: 12 }, listProps: { collapsed: "opaque" } });
  await multi.destroy();
});

it.each([10, 2000])("routes block edits without reading forests for %i blocks, and never loads unrelated documents", async (count) => {
  const open = jestApi.fn(async (id: string) => model(id));
  const multi = new EditorStorage({ openDocument: open, createEditor: configured });
  const a = await multi.getSingleEditor("A"); const b = await multi.getSingleEditor("B");
  a.blocks.insertBlock({ id: "a", type: "paragraph", children: Array.from({ length: count }, (_, index) => ({ id: `a-${index}`, type: "paragraph" })) });
  b.blocks.insertBlock({ id: "b", type: "paragraph", content: "B" });
  const reads = jestApi.spyOn(a.blocks, "getBlocks"); const otherReads = jestApi.spyOn(b.blocks, "getBlocks");
  a.blocks.updateBlock(`a-${count - 1}`, { content: "Routed" });
  expect(a.blocks.getBlockNode(`a-${count - 1}`)?.content).toBe("Routed");
  expect(reads).not.toHaveBeenCalled(); expect(otherReads).not.toHaveBeenCalled();
  expect(open.mock.calls.map(([id]) => id)).toEqual(["A", "B"]);
  expect(multi.findEditorWithBlock("unknown")).toBeUndefined();
  await multi.destroy();
});

it("resolves qualified IDs first and reports ambiguity only for fallback", async () => {
  const multi = new EditorStorage({ createEditor: configured });
  const a = await multi.getSingleEditor("A"); const b = await multi.getSingleEditor("B");
  for (const editor of [a, b]) editor.blocks.insertBlock({ id: "same", type: "paragraph" });
  expect(await multi.resolveBlock({ documentId: "B", blockId: "same" })).toEqual({ documentId: "B", ambiguous: false });
  expect(await multi.resolveBlock({ documentId: "missing", blockId: "same" })).toEqual({ documentId: "missing", ambiguous: false });
  const empty = await multi.getSingleEditor("empty");
  expect(await multi.resolveBlock({ documentId: empty.getDocument().id, blockId: "same" })).toEqual({ documentId: "A", ambiguous: true });
  b.blocks.updateBlock("same", { content: "Explicit" });
  expect(b.blocks.getBlockNode("same")?.content).toBe("Explicit"); expect(a.blocks.getBlockNode("same")?.content).toBe("");
  expect(() => a.blocks.updateBlock("unknown", { content: "Wrong target" })).toThrow();
  await multi.destroy();
});


it("remaps clipboard subtree IDs only against the destination document and does not overwrite source data", async () => {
  const multi = new EditorStorage({ createEditor: configured });
  const a = await multi.getSingleEditor("A"); const b = await multi.getSingleEditor("B");
  a.blocks.insertBlock({ id: "source", type: "paragraph", content: "Parent", children: [{ id: "child", type: "paragraph", content: "Child" }] });
  a.selection.set(createStructuralSelection(["source"]));
  const bundle = await a.clipboard.copy();
  await b.clipboard.paste( { bundle, placement: { mergeText: false } });
  const first = b.blocks.getBlocks()[0]!;
  expect(first.id).toBe("source"); expect(first.children[0]!.id).toBe("child");
  expect(first.content).toBe("Parent"); expect(first.children[0]!.content).toBe("Child");
  await b.clipboard.paste( { bundle, placement: { mergeText: false } });
  const ids = b.blocks.getBlocks().flatMap((block) => [block.id, ...block.children.map((child) => child.id)]);
  expect(new Set(ids).size).toBe(4); expect(a.blocks.getBlockNode("source")?.content).toBe("Parent");
  await multi.destroy();
});

it("keeps selection, subscriptions and history independent between single editors", async () => {
  const multi = new EditorStorage({ createEditor: configured });
  const a = await multi.getSingleEditor("A"); const b = await multi.getSingleEditor("B");
  a.blocks.insertBlock({ id: "a", type: "paragraph", content: "A" }); b.blocks.insertBlock({ id: "b", type: "paragraph", content: "B" });
  a.selection.set(createCaretSelection("a", 0)); b.selection.set(createCaretSelection("b", 1));
  const subscriber = jestApi.fn(); a.blocks.subscribeBlockNode("a", subscriber);
  b.blocks.updateBlock("b", { content: "Updated" }); expect(subscriber).not.toHaveBeenCalled();
  b.history.undo(); expect(b.blocks.getBlockNode("b")?.content).toBe("B");
  expect(a.selection.get()?.focusBlockId).toBe("a"); expect(b.selection.get()?.focusBlockId).toBe("b");
  await multi.destroy();
});

it("transfers stable subtree IDs and validates the destination before deleting the source", async () => {
  const multi = new EditorStorage({ createEditor: configured });
  const a = await multi.getSingleEditor("A"); const b = await multi.getSingleEditor("B");
  a.blocks.insertBlock({ id: "parent", type: "paragraph", children: [{ id: "child", type: "paragraph" }] });
  expect(() => crossDocumentBlockTransfer(multi.getEditor("A")!, multi.getEditor("B")!, ["parent"], { targetId: "missing", position: "inside" })).toThrow();
  expect(a.blocks.hasBlock("parent")).toBe(true); expect(b.blocks.getRootIds()).toEqual([]);
  crossDocumentBlockTransfer(multi.getEditor("A")!, multi.getEditor("B")!, ["parent"], { targetId: null, position: "after" });
  expect(a.blocks.hasBlock("parent")).toBe(false); expect(b.blocks.getBlock("parent")?.children[0]?.id).toBe("child");
  a.history.undo(); expect(a.blocks.hasBlock("parent")).toBe(true);
  b.history.undo(); expect(b.blocks.hasBlock("parent")).toBe(false);
  await multi.destroy();
});

it("rejects destination type rules without a partial transfer", async () => {
  const multi = new EditorStorage({ createEditor: (editor) => {
    const document = editor.getDocument();
    if (document.id === "A") editor.blockRegistry.defineBlock({ type: "custom" });
    return createReactEditor({ editor });
  } });
  const a = await multi.getSingleEditor("A"); const b = await multi.getSingleEditor("B");
  a.blocks.insertBlock({ id: "custom", type: "custom" });
  expect(() => crossDocumentBlockTransfer(multi.getEditor("A")!, multi.getEditor("B")!, ["custom"], { targetId: null, position: "after" })).toThrow("not registered");
  expect(a.blocks.hasBlock("custom")).toBe(true); expect(b.blocks.getRootIds()).toEqual([]);
  await multi.destroy();
});

it("shares view consumers, keeps explicit ownership, and closes the model exactly once", async () => {
  const multi = new EditorStorage();
  const [first, second] = await Promise.all([multi.acquireEditor("A"), multi.acquireEditor("A")]);
  expect(first.editor).toBe(second.editor);
  const destroy = jestApi.spyOn(first.document, "destroy");
  await first.release(); expect(destroy).not.toHaveBeenCalled();
  await multi.getSingleEditor("A"); await second.release(); expect(destroy).not.toHaveBeenCalled();
  await multi.closeEditor("A"); await first.release(); expect(destroy).toHaveBeenCalledTimes(1);
  await multi.destroy();
});

it("cancels one waiting view without cancelling another consumer", async () => {
  let finish!: (document: DocumentModelImpl) => void;
  const document = model("A"); const multi = new EditorStorage({ openDocument: () => new Promise((resolve) => { finish = resolve; }) });
  const controller = new AbortController();
  const first = multi.acquireEditor("A", { signal: controller.signal }); const second = multi.acquireEditor("A");
  await Promise.resolve(); await Promise.resolve(); controller.abort(new Error("cancelled"));
  await expect(first).rejects.toThrow("cancelled"); finish(document);
  const retained = await second; expect(retained.document).toBe(document);
  await retained.release(); expect(multi.getEditors()).toEqual([]); await multi.destroy();
});

it("disposes late loader results during shutdown and permits retry after loader failure", async () => {
  let finish!: (document: DocumentModelImpl) => void;
  const multi = new EditorStorage({ openDocument: () => new Promise((resolve) => { finish = resolve; }) });
  const loading = multi.getSingleEditor("A"); await Promise.resolve(); await Promise.resolve();
  const closing = multi.destroy(); const document = model("A"); const destroy = jestApi.spyOn(document, "destroy");
  finish(document); await expect(loading).rejects.toThrow("destroyed"); await closing;
  expect(destroy).toHaveBeenCalledTimes(1);
  let attempts = 0;
  const retry = new EditorStorage({ openDocument: async (id) => { if (++attempts === 1) throw new Error("offline"); return model(id); } });
  await expect(retry.getSingleEditor("B")).rejects.toThrow("offline");
  expect((await retry.getSingleEditor("B")).getDocument().id).toBe("B"); await retry.destroy();
});

it("rolls back failed factory/setup, including a model returned with the wrong identity", async () => {
  const document = model("wrong"); const destroy = jestApi.spyOn(document, "destroy");
  const multi = new EditorStorage({ openDocument: async () => document });
  await expect(multi.getSingleEditor("expected")).rejects.toThrow("Expected document"); expect(destroy).toHaveBeenCalledTimes(1);
  await multi.destroy();
  const factoryDocument = model("A"); const factoryDestroy = jestApi.spyOn(factoryDocument, "destroy");
  let factoryCore!: RivtoEditorApi;
  const failed = new EditorStorage({ openDocument: async () => factoryDocument, createEditor: (editor) => {
    factoryCore = editor;
    jestApi.spyOn(editor, "destroy");
    throw new Error("factory failed");
  } });
  await expect(failed.getSingleEditor("A")).rejects.toThrow("factory failed");
  expect(factoryCore.destroy).toHaveBeenCalledTimes(1);
  expect(factoryDestroy).toHaveBeenCalledTimes(1); await failed.destroy();
});




it.each(["view", "explicit"])("reopens safely when a %s request races the final view release", async (kind) => {
  const multi = new EditorStorage();
  const first = await multi.acquireEditor("A");
  const requested = kind === "view" ? multi.acquireEditor("A") : multi.getSingleEditor("A");
  const closing = first.release();
  const result = await requested;
  const editor = "editor" in result ? result.editor : result;
  await closing;
  expect(editor).not.toBe(first.editor);
  expect(multi.getEditor("A")!.blocks).toBe(editor.blocks);
  if ("release" in result) await result.release();
  await multi.destroy();
});


it("cancels embedding lookup promptly even when the application ignores its signal", async () => {
  let finish!: (ids: readonly string[]) => void;
  const multi = new EditorStorage({ lookupDocumentIds: () => new Promise((resolve) => { finish = resolve; }) });
  const controller = new AbortController(); const reason = new Error("lookup cancelled");
  const failure = jestApi.fn();
  const pending = multi.resolveBlock({ documentId: "preferred", blockId: "target" }, { signal: controller.signal }).catch(failure);
  controller.abort(reason);
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  try { expect(failure).toHaveBeenCalledWith(reason); }
  finally { finish([]); await pending; await multi.destroy(); }
});

it("resolves closed sources through metadata without opening candidates, and selects a sorted ambiguous fallback", async () => {
  const open = jestApi.fn(async (id: string) => model(id));
  const lookup = jestApi.fn(async () => ["Z", "A", "A"]);
  const multi = new EditorStorage({ openDocument: open, lookupDocumentIds: lookup });
  expect(await multi.resolveBlock({ documentId: "Z", blockId: "same" })).toEqual({ documentId: "Z", ambiguous: false });
  expect(await multi.resolveBlock({ documentId: "old", blockId: "same" })).toEqual({ documentId: "A", ambiguous: true });
  expect(open).not.toHaveBeenCalled();
  const z = await multi.getSingleEditor("Z");
  z.getDocument().blocks.insertBlock({ id: "same", type: "opaque" });
  lookup.mockClear();
  expect(await multi.resolveBlock({ documentId: "Z", blockId: "same" })).toEqual({ documentId: "Z", ambiguous: false });
  expect(lookup).not.toHaveBeenCalled();
  await multi.destroy();
});

it("keeps a pending preferred source when metadata confirms it, rather than using an already loaded duplicate", async () => {
  const multi = new EditorStorage({ lookupDocumentIds: async () => ["A", "B"] });
  const a = await multi.getSingleEditor("A"); const b = await multi.getSingleEditor("B");
  a.getDocument().blocks.insertBlock({ id: "same", type: "opaque", content: "Other document" });
  expect(b.blocks.hasBlock("same")).toBe(false);
  expect(await multi.resolveBlock({ documentId: "B", blockId: "same" })).toEqual({ documentId: "B", ambiguous: false });
  b.getDocument().blocks.insertBlock({ id: "same", type: "opaque", content: "Arrived later" });
  expect(await multi.resolveBlock({ documentId: "B", blockId: "same" })).toEqual({ documentId: "B", ambiguous: false });
  await multi.destroy();
});

it("uses the application's resolver and propagates loading errors without choosing another source", async () => {
  const resolve = jestApi.fn(async () => ({ documentId: "chosen", ambiguous: false }));
  const multi = new EditorStorage({ resolveBlock: resolve });
  const reference = { documentId: "old", blockId: "same" };
  expect(await multi.resolveBlock(reference)).toEqual({ documentId: "chosen", ambiguous: false });
  expect(resolve).toHaveBeenCalledWith(reference, {});
  expect(reference).toEqual({ documentId: "old", blockId: "same" });
  await multi.destroy();
  const broken = new EditorStorage({ lookupDocumentIds: async () => { throw new Error("database unavailable"); } });
  await expect(broken.resolveBlock(reference)).rejects.toThrow("database unavailable");
  await broken.destroy();
});

it.each([10, 2000])("observes only a directly addressed document and performs no fallback searches while editing %i blocks", async (count) => {
  const lookup = jestApi.fn(async () => ["A", "B"]);
  const multi = new EditorStorage({ lookupDocumentIds: lookup });
  const a = await multi.getSingleEditor("A"); const b = await multi.getSingleEditor("B");
  a.getDocument().blocks.insertBlock({ id: "same", type: "opaque", children: Array.from({ length: count }, (_, index) => ({ id: `child-${index}`, type: "opaque" })) });
  b.getDocument().blocks.insertBlock({ id: "same", type: "opaque" });
  const observeOther = jestApi.spyOn(b.getDocument().blocks, "subscribeBlockNode");
  const stop = multi.subscribeBlockLocation({ documentId: "A", blockId: "same" }, () => undefined);
  for (let turn = 0; turn < 15; turn += 1) await Promise.resolve();
  lookup.mockClear();
  a.getDocument().blocks.setBlockText("same", "Edited");
  b.getDocument().blocks.setBlockText("same", "Unrelated edit");
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  expect(a.blocks.getBlockNode("same")?.content).toBe("Edited");
  expect(lookup).not.toHaveBeenCalled(); expect(observeOther).not.toHaveBeenCalled();
  stop(); await multi.destroy();
});
