import { createRivtoEditor } from "../rivto-editor";

describe("EditorRuntime undo manager", () => {
  it("undoes and redoes one document command at a time", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "Initial" });

    editor.updateBlock(id, { content: "Updated" });

    editor.undo();
    expect(editor.document.document).toMatchObject([{ id, content: "Initial" }]);

    editor.redo();
    expect(editor.document.document).toMatchObject([{ id, content: "Updated" }]);
    editor.destroy();
  });

  it("keeps fast consecutive commands as separate undo steps", () => {
    const editor = createRivtoEditor();

    const id = editor.insertBlock({ type: "paragraph", content: "Initial" });
    editor.setBlockProp(id, "tone", "info");

    editor.undo();
    expect(editor.document.document).toMatchObject([{ id, content: "Initial", props: {} }]);

    editor.undo();
    expect(editor.document.document).toEqual([]);
    editor.destroy();
  });

  it("keeps consecutive block updates in one capture group", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "Initial" });

    editor.updateBlock(id, { content: "First" });
    editor.updateBlock(id, { content: "Second" });

    editor.undo();

    expect(editor.document.document).toMatchObject([{ id, content: "Initial" }]);
    editor.destroy();
  });

  it("keeps undo history across mode switches and splits typing capture", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "Initial" });

    editor.updateBlock(id, { content: "First" });
    editor.mode.set("edgeless");
    editor.updateBlock(id, { content: "Second" });

    editor.undo();
    expect(editor.document.document).toMatchObject([{ id, content: "First" }]);

    editor.undo();
    expect(editor.document.document).toMatchObject([{ id, content: "Initial" }]);
    editor.destroy();
  });

  it("publishes document updates for undo and redo", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "Initial" });
    const calls: string[] = [];
    const unsubscribe = editor.document.subscribe(() => calls.push(editor.document.document[0]?.content ?? ""));

    editor.updateBlock(id, { content: "Updated" });
    editor.execute("history.undo");
    editor.execute("history.redo");

    expect(calls).toEqual(["Updated", "Initial", "Updated"]);
    expect(editor.document.document).toMatchObject([{ id, content: "Updated" }]);
    unsubscribe();
    editor.destroy();
  });

  it("clears history after loading persisted state", () => {
    const editor = createRivtoEditor();

    editor.insertBlock({ type: "paragraph", content: "Before load" });
    editor.load({
      version: 4,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        collapsed: false,
        props: {},
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
      links: [],
    });

    editor.undo();

    expect(editor.document.document).toMatchObject([{ id: "loaded", content: "Loaded" }]);
    editor.destroy();
  });

  it("tracks link commands in the same local history", () => {
    const editor = createRivtoEditor();
    const sourceId = editor.insertBlock({ type: "paragraph" });
    const targetId = editor.insertBlock({ type: "paragraph" }, sourceId);

    editor.createLink({ id: "source-target", from: { blockId: sourceId }, to: { blockId: targetId } });
    expect(editor.dump().links).toHaveLength(1);

    editor.undo();
    expect(editor.dump().links).toEqual([]);

    editor.redo();
    expect(editor.dump().links).toMatchObject([{ id: "source-target" }]);
    editor.destroy();
  });
});
