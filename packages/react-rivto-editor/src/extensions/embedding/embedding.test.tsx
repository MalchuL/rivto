import { renderToStaticMarkup } from "react-dom/server";
import { createStructuralSelection } from "@chulane/rivto";
import { DocumentStorage } from "@chulane/document-model";
import { YjsDocumentRegistry } from "@chulane/crdt-doc";
import { createTestMultiEditor } from "../../test-utils";
import { PageSurface } from "../../surfaces/page/page-surface";
import { EditorView } from "../../editor-view";
import { EditorStorageContext } from "../../editor-storage-context";
import { standardPreset } from "../built-ins/built-ins";
import { embeddingExtension, EMBEDDING_BLOCK_TYPE } from "./embedding";
import { crossDocumentBlockTransfer } from "../built-ins/clipboard/cross-document-block-transfer";

test("embedding props validate, snapshots and structured clipboard retain references, and cleanup removes registration", async () => {
  const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
  const source = await storage.create("source", [{ id: "target", type: "paragraph", content: "source" }]);
  const host = await storage.create("host");
  const runtime = await createTestMultiEditor([host, source], storage, { extensions: [standardPreset(), embeddingExtension()] });
  const editor = await runtime.getSingleEditor(host.id);
  const editorRuntime = runtime.getEditor(host.id)!;
  const reference = editorRuntime.blocks.insertBlock({ type: EMBEDDING_BLOCK_TYPE, props: { targetDocumentId: "source", targetBlockId: "target" } });
  expect(reference.content).toBe("");
  expect(() => editorRuntime.blocks.setBlockProp(reference.id, "targetBlockId", 12)).toThrow();
  editor.selection.set(createStructuralSelection([reference.id], reference.id));
  const copied = editor.clipboard.copy();
  expect(copied?.blocks[0]?.props).toEqual({ targetDocumentId: "source", targetBlockId: "target" });
  expect(copied?.blocks[0]?.children).toEqual([]);
  expect(editor.dump().blocks[0]?.props).toEqual({ targetDocumentId: "source", targetBlockId: "target" });
  const formats = editorRuntime.clipboard.format([reference]);
  expect(formats.plain).toBe("Embedded block: source/target");
  const standalone = renderToStaticMarkup(<EditorView runtime={editorRuntime}><PageSurface /></EditorView>);
  expect(standalone).toContain("Block resolution is unavailable.");
  const markup = renderToStaticMarkup(<EditorStorageContext.Provider value={runtime}>
    <EditorView runtime={editorRuntime}><PageSurface /></EditorView>
  </EditorStorageContext.Provider>);
  expect(markup).toContain("Loading embedded block…");
  expect(markup).not.toContain("Block resolution is unavailable.");
  expect("editorStorage" in editorRuntime).toBe(false);
  expect(markup).toContain('aria-label="Edit embedding"');
  expect(markup).not.toContain('aria-label="Target block ID"');
  expect(markup).not.toContain('aria-label="Target document ID"');
  expect(markup).toContain('data-slot-position="right"');
  expect(markup).not.toContain("Live reference");
  expect(markup).not.toContain(">Embedded block<");
  expect(markup).toContain('data-block-selection-anchor=""');
  expect(markup).toContain('data-slot-position="body"');
  expect(editorRuntime.views.acceptsDrop({ kind: "between", parentId: reference.id, previousId: null, nextId: null, depth: 1 }, [source.blocks.getBlock("target")!])).toBe(true);
  const sourceEditor = await runtime.getSingleEditor(source.id);
  crossDocumentBlockTransfer(sourceEditor, editor, ["target"], { targetId: null, position: "after" });
  expect(source.blocks.hasBlock("target")).toBe(false);
  expect(host.blocks.hasBlock("target")).toBe(true);
  editorRuntime.destroy();
  expect(editor.blockRegistry.has(EMBEDDING_BLOCK_TYPE)).toBe(false);
  await runtime.destroy(); await storage.destroy();
});

test("clipboard retargets copied internal references and preserves qualified external references in one undo", async () => {
  const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
  const source = await storage.create("A"); const target = await storage.create("B");
  const runtime = await createTestMultiEditor([source, target], storage, { extensions: [standardPreset(), embeddingExtension()] });
  const a = await runtime.getSingleEditor("A"); const b = await runtime.getSingleEditor("B");
  a.blocks.insertBlock({ id: "branch", type: "paragraph", children: [
    { id: "target", type: "paragraph", content: "Copied target" },
    { id: "internal", type: EMBEDDING_BLOCK_TYPE, props: { targetDocumentId: "A", targetBlockId: "target" } },
    { id: "external", type: EMBEDDING_BLOCK_TYPE, props: { targetDocumentId: "other", targetBlockId: "target" } },
  ] });
  b.blocks.insertBlock({ id: "target", type: "paragraph", content: "Existing target" });
  b.history.clear();
  a.selection.set(createStructuralSelection(["branch"]));
  const bundle = a.clipboard.copy()!;
  expect(bundle.sourceDocumentId).toBe("A");
  b.clipboard.paste({ bundle, placement: { mergeText: false } });
  const branch = b.blocks.getBlock("branch")!;
  const copied = branch.children[0]!;
  expect(copied.id).not.toBe("target");
  expect(branch.children[1]!.props).toEqual({ targetDocumentId: "B", targetBlockId: copied.id });
  expect(branch.children[2]!.props).toEqual({ targetDocumentId: "other", targetBlockId: "target" });
  expect(bundle.blocks[0]!.children[1]!.props).toEqual({ targetDocumentId: "A", targetBlockId: "target" });
  expect(b.blocks.getBlockNode("target")?.content).toBe("Existing target");
  b.history.undo(); expect(b.blocks.hasBlock("branch")).toBe(false);
  b.history.redo(); expect(b.blocks.getBlock("branch")!.children[1]!.props.targetBlockId).toBe(copied.id);
  await runtime.destroy(); await storage.destroy();
});
