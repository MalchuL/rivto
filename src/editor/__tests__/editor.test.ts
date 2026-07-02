import { createRivtoEditor } from "../editor";
import { YjsDoc } from "../../store/crdt-doc";
import { z } from "zod";

describe("RivtoEditorCore", () => {
  it("stores typed hierarchy, layout, Markdown, and schema-v3 snapshots", () => {
    const editor = createRivtoEditor({
      initialContent: [
        { id: "a", type: "paragraph", content: "Alpha" },
        { id: "b", type: "paragraph", content: "Beta" },
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
    const editor = createRivtoEditor({ initialContent: [{ id: "a", type: "paragraph" }] });
    editor.setBlockText("a", "# Heading");
    expect(editor.document[0]).toMatchObject({ type: "paragraph", content: "# Heading" });
    editor.undo();
    expect(editor.document[0].content).toBe("");
  });

  it("defines blocks and rejects duplicate native types", () => {
    const editor = createRivtoEditor();
    const dispose = editor.defineBlock({
      type: "alert",
      content: "inline",
      title: "Alert",
      defaultProps: { tone: "info" },
      propSchema: z.object({ tone: z.enum(["info", "warning"]) }),
    });

    expect(editor.blocks.get("alert")?.title).toBe("Alert");
    const id = editor.insertBlock({ type: "alert" });
    expect(editor.document[0]).toMatchObject({ id, type: "alert", props: { tone: "info" } });
    expect(() => editor.defineBlock({ type: "alert", content: "none" })).toThrow("already registered");
    expect(() => editor.insertBlock({ type: "alert", props: { tone: "invalid" } })).toThrow();

    dispose();
    expect(editor.blocks.has("alert")).toBe(false);
  });

  it("installs and disposes trusted runtime plugins", () => {
    const editor = createRivtoEditor();
    const dispose = editor.use({
      id: "test.plugin",
      blocks: [{ type: "notice", content: "inline", title: "Notice" }],
      commands: { hello: (_editor, value) => `hello ${String(value)}` },
    });

    expect(editor.blocks.get("notice")?.title).toBe("Notice");
    expect(editor.runCommand("hello", "world")).toBe("hello world");
    dispose();
    expect(editor.blocks.has("notice")).toBe(false);
    expect(() => editor.runCommand("hello")).toThrow("Unknown command");
    expect("registerPlugin" in editor).toBe(false);
    expect("getBlockSpec" in editor).toBe(false);
  });

  it("explains selection through collapsed, reversed, and cross-block values", () => {
    const editor = createRivtoEditor({ initialContent: [
      { id: "a", type: "paragraph", content: "Alpha" },
      { id: "b", type: "paragraph", content: "Beta" },
    ] });
    const listener = jest.fn();
    const unsubscribe = editor.selectionManager.subscribe(listener);

    editor.setSelection({ anchor: { blockId: "a", offset: 3 }, head: { blockId: "a", offset: 3 } });
    editor.setSelection({ anchor: { blockId: "a", offset: 5 }, head: { blockId: "a", offset: 1 } });
    expect(editor.selection).toEqual({ anchor: { blockId: "a", offset: 5 }, head: { blockId: "a", offset: 1 } });
    editor.setSelection({ anchor: { blockId: "a", offset: 2 }, head: { blockId: "b", offset: 2 } });
    expect(listener).toHaveBeenCalledTimes(3);
    expect(() => editor.setSelection({ anchor: { blockId: "missing", offset: 0 }, head: { blockId: "b", offset: 0 } })).toThrow("not found");

    editor.selectionManager.clear();
    expect(editor.selection).toBeNull();
    unsubscribe();
  });

  it("copies, cuts, and pastes normalized text selection", async () => {
    const editor = createRivtoEditor({ initialContent: [{ id: "a", type: "paragraph", content: "Hello world" }] });
    editor.setSelection({ anchor: { blockId: "a", offset: 6 }, head: { blockId: "a", offset: 11 } });
    expect(await editor.copy()).toBe("world");
    expect(await editor.cut()).toBe("world");
    expect(editor.document[0].content).toBe("Hello ");
    await editor.paste("paragraph", "Rivto");
    expect(editor.document[0].content).toBe("Hello Rivto");
  });

  it("copies complete blocks across a cross-block selection", async () => {
    const editor = createRivtoEditor({ initialContent: [
      { id: "a", type: "paragraph", content: "First block" },
      { id: "b", type: "paragraph", content: "Second block" },
    ] });
    editor.setSelection({ anchor: { blockId: "a", offset: 0 }, head: { blockId: "b", offset: 12 } });

    expect(await editor.copy()).toBe("First block\nSecond block");
  });

  it("pastes structured types with remapped IDs, links, and canvas offsets", () => {
    const editor = createRivtoEditor({ initialContent: [
      { id: "a", type: "paragraph", content: "A", layout: { x: 10, y: 20 } },
      { id: "b", type: "paragraph", content: "B", layout: { x: 30, y: 40 } },
    ] });
    editor.createLink({ id: "ab", from: { blockId: "a" }, to: { blockId: "b" } });
    editor.setSelection({ anchor: { blockId: "a", offset: 0 }, head: { blockId: "b", offset: 1 } });
    editor.clipboardManager.pasteBundle({ version: 1, blocks: editor.document, links: editor.links });

    expect(editor.document).toHaveLength(4);
    const pasted = editor.document.slice(2);
    expect(pasted.map((block) => block.id)).not.toEqual(["a", "b"]);
    expect(pasted.map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
    expect(pasted[0].layout).toMatchObject({ x: 34, y: 44 });
    expect(editor.links[1]).toMatchObject({ from: { blockId: pasted[0].id }, to: { blockId: pasted[1].id } });
  });

  it("preserves unknown stored types while requiring definitions for new blocks", () => {
    const editor = createRivtoEditor();
    editor.loadSnapshot({ version: 3, blocks: [{
      id: "unknown", type: "missing.plugin", content: "Raw", props: {}, pluginData: {}, children: [],
      layout: { x: 40, y: 40, width: 320, height: 120, zIndex: 0 },
    }], links: [] });
    expect(editor.document[0].type).toBe("missing.plugin");
    expect(editor.getSnapshot().blocks[0].type).toBe("missing.plugin");
    expect(() => editor.insertBlock({ type: "missing.plugin" })).toThrow("Unknown block type");
  });

  it("converges editor content and layout across CRDT adapters", () => {
    const docA = new YjsDoc("a");
    const docB = new YjsDoc("b");
    const editorA = createRivtoEditor({ document: docA });
    const editorB = createRivtoEditor({ document: docB });
    const id = editorA.insertBlock({ type: "paragraph", content: "Shared" });
    docB.applySnapshot(docA.getSnapshot());
    editorB.setBlockText(id, "Edited remotely");
    docA.applySnapshot(docB.getSnapshot());
    editorA.setBlockLayout(id, { x: 300, y: 200 });
    docB.applySnapshot(docA.getSnapshot());
    expect(editorB.getSnapshot()).toEqual(editorA.getSnapshot());
    docA.destroy();
    docB.destroy();
  });
});
