import { createRivtoEditor, migrateDocumentBundleV1 } from "../editor";
import { YjsDoc } from "../../store/crdt-doc";

describe("RivtoEditorCore", () => {
  it("stores rich blocks, hierarchy, layout, and snapshots in Yjs", () => {
    const editor = createRivtoEditor({
      initialContent: [
        { id: "a", content: "Alpha" },
        { id: "b", content: "Beta" },
      ],
    });

    editor.indentBlock("b");
    editor.setBlockLayout("a", { x: 240, y: 80 });
    editor.formatText("a", 0, 5, "bold");

    expect(editor.document).toHaveLength(1);
    expect(editor.document[0].children[0].id).toBe("b");
    expect(editor.document[0].content).toBe("**Alpha**");
    expect(editor.document[0].layout).toMatchObject({ x: 240, y: 80 });

    const snapshot = editor.getSnapshot();
    const restored = createRivtoEditor();
    restored.loadSnapshot(snapshot);
    expect(restored.getSnapshot()).toEqual(snapshot);
  });

  it("stores Markdown source and supports local undo", () => {
    const editor = createRivtoEditor({ initialContent: [{ id: "a" }] });

    editor.setBlockText("a", "# Heading");
    expect(editor.document[0]).toMatchObject({ type: "paragraph", content: "# Heading" });

    editor.undo();
    expect(editor.document[0].content).toBe("");
  });

  it("registers and disposes trusted runtime plugins", () => {
    const editor = createRivtoEditor();
    const dispose = editor.registerPlugin({
      id: "test.plugin",
      blocks: [{ type: "alert", content: "inline", title: "Alert" }],
      commands: { hello: (_editor, value) => `hello ${String(value)}` },
    });

    expect(editor.getBlockSpec("alert")?.title).toBe("Alert");
    expect(editor.runCommand("hello", "world")).toBe("hello world");
    dispose();
    expect(editor.getBlockSpec("alert")).toBeUndefined();
    expect(() => editor.runCommand("hello")).toThrow("Unknown command");
  });

  it("copies, cuts, and pastes the normalized text selection", async () => {
    const editor = createRivtoEditor({ initialContent: [{ id: "a", content: "Hello world" }] });
    editor.setSelection({ anchor: { blockId: "a", offset: 6 }, head: { blockId: "a", offset: 11 } });
    expect(await editor.copy()).toBe("world");
    expect(await editor.cut()).toBe("world");
    expect(editor.document[0].content).toBe("Hello ");
    await editor.paste("Rivto");
    expect(editor.document[0].content).toBe("Hello Rivto");
  });

  it("pastes structured blocks with remapped IDs, links, and canvas offsets", () => {
    const editor = createRivtoEditor({
      initialContent: [
        { id: "a", content: "A", layout: { x: 10, y: 20 } },
        { id: "b", content: "B", layout: { x: 30, y: 40 } },
      ],
    });
    editor.createLink({ id: "ab", from: { blockId: "a" }, to: { blockId: "b" } });
    editor.setSelection({ anchor: { blockId: "a", offset: 0 }, head: { blockId: "b", offset: 1 } });

    editor.clipboardManager.pasteBundle({
      version: 1,
      blocks: editor.document,
      links: editor.links,
    });

    expect(editor.document).toHaveLength(4);
    expect(editor.links).toHaveLength(2);
    const pasted = editor.document.slice(2);
    expect(pasted.map((block) => block.id)).not.toEqual(["a", "b"]);
    expect(pasted[0].layout).toMatchObject({ x: 34, y: 44 });
    expect(editor.links[1]).toMatchObject({
      from: { blockId: pasted[0].id },
      to: { blockId: pasted[1].id },
    });
  });

  it("converges editor content and layout across Yjs documents", () => {
    const docA = new YjsDoc("a");
    const docB = new YjsDoc("b");
    const editorA = createRivtoEditor({ document: docA });
    const editorB = createRivtoEditor({ document: docB });

    const id = editorA.insertBlock({ content: "Shared" });
    docB.applySnapshot(docA.getSnapshot());
    editorB.setBlockText(id, "Edited remotely");
    docA.applySnapshot(docB.getSnapshot());
    editorA.setBlockLayout(id, { x: 300, y: 200 });
    docB.applySnapshot(docA.getSnapshot());

    expect(editorB.getSnapshot()).toEqual(editorA.getSnapshot());
    expect(editorB.document[0].layout).toMatchObject({ x: 300, y: 200 });
    docA.destroy();
    docB.destroy();
  });

  it("migrates ordered v1 blocks without mutating the bundle", () => {
    const bundle = {
      version: 1,
      blocks: [
        { id: "b", type: "paragraph", order: 1, meta: { text: "Second", color: "red" }, pluginStates: { comments: { open: true } } },
        { id: "a", type: "paragraph", order: 0, meta: { text: "First" }, position: { x: 12, y: 34 } },
      ],
    };
    const before = JSON.stringify(bundle);
    const migrated = migrateDocumentBundleV1(bundle);

    expect(migrated.blocks.map((block) => block.id)).toEqual(["a", "b"]);
    expect(migrated.blocks[0].content).toBe("First");
    expect(migrated.blocks[0].layout).toMatchObject({ x: 12, y: 34 });
    expect(migrated.blocks[1].props).toEqual({ color: "red" });
    expect(migrated.blocks[1].pluginData).toEqual({ comments: { open: true } });
    expect(JSON.stringify(bundle)).toBe(before);
  });
});
