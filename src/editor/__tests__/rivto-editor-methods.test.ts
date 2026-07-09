import { createRivtoEditor } from "../rivto-editor";

describe("EditorRuntime methods", () => {
  it("mutates blocks through editor methods", () => {
    const editor = createRivtoEditor();

    const firstId = editor.insertBlock({ type: "paragraph", content: "First" });
    const secondId = editor.insertBlock({ type: "paragraph", content: "Second" }, firstId);

    editor.updateBlock(firstId, { content: "First updated" });
    editor.setBlockProp(firstId, "tone", "info");
    editor.setBlockPluginData(firstId, "test", { seen: true });
    editor.setBlockLayout(firstId, { x: 120, y: 80 });
    editor.indentBlock(secondId);

    expect(editor.document.document).toMatchObject([
      {
        id: firstId,
        content: "First updated",
        props: { tone: "info" },
        pluginData: { test: { seen: true } },
        layout: { x: 120, y: 80 },
        children: [{ id: secondId, content: "Second" }],
      },
    ]);

    editor.outdentBlock(secondId);
    editor.moveBlock(secondId, null);

    expect(editor.document.document.map((block) => block.id)).toEqual([secondId, firstId]);

    editor.removeBlock(secondId);

    expect(editor.document.document.map((block) => block.id)).toEqual([firstId]);
    editor.destroy();
  });

  it("mutates links through editor methods", () => {
    const editor = createRivtoEditor();
    const sourceId = editor.insertBlock({ type: "paragraph" });
    const targetId = editor.insertBlock({ type: "paragraph" }, sourceId);

    editor.createLink({
      id: "source-target",
      from: { blockId: sourceId },
      to: { blockId: targetId },
      meta: { label: "related" },
    });

    expect(editor.dump().links).toEqual([
      {
        id: "source-target",
        from: { blockId: sourceId },
        to: { blockId: targetId },
        meta: { label: "related" },
      },
    ]);

    editor.removeLink("source-target");

    expect(editor.dump().links).toEqual([]);
    editor.destroy();
  });

  it("loads and dumps snapshots through editor methods", () => {
    const editor = createRivtoEditor();

    editor.load({
      version: 3,
      blocks: [{
        id: "loaded",
        type: "paragraph",
        props: { tone: "success" },
        pluginData: {},
        content: "Loaded",
        children: [],
      }],
      links: [],
      pluginData: { app: { theme: "dark" } },
    });

    expect(editor.dump()).toMatchObject({
      version: 3,
      blocks: [{ id: "loaded", content: "Loaded", props: { tone: "success" } }],
      links: [],
      pluginData: { app: { theme: "dark" } },
    });
    editor.destroy();
  });
});
