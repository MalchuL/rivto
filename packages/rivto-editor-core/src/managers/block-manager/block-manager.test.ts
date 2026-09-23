/**
 * Verifies editor-owned outline policies against the generic document store.
 * Exercises page and edgeless runtimes, grouped movement, imports, and command
 * behavior without coupling those policies to document storage.
 */
import { createTestEditor, createStructuralSelection } from "../../editor/test-utils";

describe.each(["block", "edgeless"] as const)("block feature ownership in %s mode", (mode) => {
  it("returns the complete block assembled during insertion", () => {
    const editor = createTestEditor({ mode });

    const inserted = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Root",
      children: [{ type: "paragraph", content: "Child" }],
    });

    expect(inserted).toMatchObject({
      type: "paragraph",
      content: "Root",
      children: [{ type: "paragraph", content: "Child" }],
    });
    editor.destroy();
  });

  it("returns lightweight identities after single and batch updates", () => {
    const editor = createTestEditor({ mode });
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "Child" }],
    });
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first.id);
    const getBlock = jest.spyOn(editor.blocks, "getBlock");

    const updated = editor.blocks.updateBlock(first.id, { content: "Updated" });
    const batch = editor.blocks.updateBlocks([
      { id: second.id, patch: { content: "Second updated" } },
      { id: first.id, patch: { props: { tone: "info" } } },
    ]);

    expect(updated).toMatchObject({ id: first.id, content: "Updated" });
    expect(updated).not.toHaveProperty("children");
    expect(batch).toMatchObject([
      { id: second.id, content: "Second updated" },
      { id: first.id, content: "Updated", props: { tone: "info" } },
    ]);
    expect(batch).not.toContainEqual(expect.objectContaining({ children: expect.anything() }));
    expect(getBlock).not.toHaveBeenCalled();
    getBlock.mockRestore();
    expect(editor.blocks.getBlockNode(first.id)).toMatchObject({
      content: "Updated",
      props: { tone: "info" },
    });
    editor.destroy();
  });

  it("owns recursive list-property preparation and validation in core", () => {
    const editor = createTestEditor({ mode });
    editor.blockListProps.register({
      id: "outline",
      defaults: { collapsed: false },
      isValid: (candidate) => typeof candidate.collapsed === "boolean",
    });

    const rootId = editor.blocks.insertBlock({
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    }).id;
    expect(editor.blocks.getBlock(rootId)).toMatchObject({
      listProps: { collapsed: false },
      children: [{ id: "child", listProps: { collapsed: false } }],
    });
    expect(editor.blockListProps.validate({ collapsed: false })).toBeUndefined();
    expect(() => editor.blockListProps.validate({ collapsed: "yes" }))
      .toThrow("Invalid block list properties");
    expect(() => editor.blocks.updateBlock(rootId, { listProps: { collapsed: "yes" } }))
      .toThrow("Invalid block list properties");
    expect(() => editor.blocks.deleteListProps("missing", ["collapsed"]))
      .toThrow("Block missing not found");
    expect(() => editor.blocks.deleteListPropsBatch([
      { id: rootId, keys: ["collapsed"] },
      { id: "missing", keys: ["collapsed"] },
    ])).toThrow("Block missing not found");
    expect(editor.blocks.getBlockNode(rootId)?.listProps).toEqual({ collapsed: false });
    editor.destroy();
  });

  it("prepares definitions and processors recursively through one public pipeline", () => {
    const editor = createTestEditor({ mode });
    let sequence = 0;
    editor.blockRegistry.defineBlock({
      type: "prepared",
      defaultProps: () => ({ sequence: ++sequence }),
    });
    editor.blocks.registerProcessor({
      id: "test.prepared",
      priority: 0,
      processor: (block) => ({ ...block, props: { ...block.props, processed: true } }),
    });

    const prepared = editor.blocks.prepareInput([{
      type: "prepared",
      children: [{ type: "prepared", props: { own: true } }],
    }])[0]!;

    expect(prepared).toMatchObject({
      props: { sequence: 1, processed: true },
      children: [{ props: { sequence: 2, own: true, processed: true } }],
    });
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("rejects a cycle introduced by a creation processor before recursion overflows", () => {
    const editor = createTestEditor({ mode });
    editor.blocks.registerProcessor({
      id: "test.cyclic-children",
      priority: 0,
      processor: (block) => {
        const children: typeof block[] = [];
        const processed = { ...block, children };
        children.push(processed);
        return processed;
      },
    });

    expect(() => editor.blocks.prepareInput([{ type: "paragraph" }]))
      .toThrow("Block forest must be acyclic");
    editor.destroy();
  });

  it("retries one failed block through the preparation error handler", () => {
    const editor = createTestEditor({ mode });
    const failures: string[] = [];
    const prepared = editor.blocks.prepareInput([{
      type: "paragraph",
      children: [{ type: "missing", content: "Original" }],
    }], (block, error) => {
      failures.push(`${block.type}:${error instanceof Error ? error.message : String(error)}`);
      return { type: "paragraph", content: "Replacement" };
    });

    expect(prepared[0]?.children).toMatchObject([{ type: "paragraph", content: "Replacement" }]);
    expect(failures).toHaveLength(1);
    expect(() => editor.blocks.prepareInput(
      [{ type: "missing" }],
      () => ({ type: "still-missing" }),
    )).toThrow("Block type still-missing is unavailable");
    editor.destroy();
  });

  it("prepares and validates a complete import before writing its first root", () => {
    const editor = createTestEditor({ mode });
    const complete = (id: string, type: string) => ({
      id,
      type,
      listProps: {},
      props: {},
      pluginData: {},
      content: id,
      children: [],
    });

    expect(() => editor.blocks.importForest([
      complete("valid", "paragraph"),
      complete("invalid", "missing"),
    ])).toThrow("Block type missing is unavailable");
    expect(editor.blocks.getBlocks()).toEqual([]);
    editor.destroy();
  });

  it("keeps feature commands off document storage and merges through the editor", () => {
    const editor = createTestEditor({ mode });
    const target = editor.blocks.insertBlock({ type: "paragraph", content: "Hello " }).id;
    const source = editor.blocks.insertBlock({
      type: "paragraph",
      content: "world",
      children: [{ id: "child", type: "paragraph" }],
    }).id;
    editor.history.clear();
    const before = editor.dump();
    const exposesDocument: "document" extends keyof typeof editor ? true : false = false;
    expect(exposesDocument).toBe(false);
    expect(editor.blocks.mergeBlocks(target, source)).toBe(6);
    expect(editor.blocks.getBlockNode(target)?.content).toBe("Hello world");
    expect(editor.blocks.getBlockNode(target)?.childIds).toEqual(["child"]);
    editor.history.undo();
    expect(editor.dump()).toEqual(before);
    editor.destroy();
  });

  it("indents only the supplied ids even when other blocks are selected", () => {
    const editor = createTestEditor({ mode });
    const previousId = editor.blocks.insertBlock({ type: "paragraph", content: "Previous" }).id;
    const firstId = editor.blocks.insertBlock({ type: "paragraph", content: "First" }, previousId).id;
    const secondId = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, firstId).id;
    editor.selection.set(createStructuralSelection([firstId, secondId], firstId, secondId));
    editor.blocks.indentBlock(firstId);
    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: previousId, children: [{ id: firstId }] },
      { id: secondId },
    ]);
    editor.destroy();
  });

  it("imports forests and reports stable source-to-destination identities", () => {
    const editor = createTestEditor({ mode });
    const root = editor.blocks.insertBlock({
      id: "source-root",
      type: "paragraph",
      children: [{ id: "source-child", type: "paragraph" }],
    }).id;
    const source = editor.blocks.getBlock(root)!;
    editor.blocks.removeBlock(root);

    const restored = editor.blocks.importForest([source]);
    expect([...restored.idMap]).toEqual([
      ["source-root", "source-root"],
      ["source-child", "source-child"],
    ]);

    const copied = editor.blocks.importForest([source]);
    const copiedRootId = copied.idMap.get("source-root");
    const copiedChildId = copied.idMap.get("source-child");
    expect(copied.roots.map(({ id }) => id)).toEqual([copiedRootId]);
    expect(copiedRootId).not.toBe("source-root");
    expect(copiedChildId).not.toBe("source-child");
    expect(copiedRootId).not.toBe(copiedChildId);
    editor.destroy();
  });

  it("imports ID-less inputs and returns complete persisted roots", () => {
    const editor = createTestEditor({ mode });
    const getBlock = jest.spyOn(editor.blocks, "getBlock");

    const imported = editor.blocks.importForest([{
      type: "paragraph",
      content: "Parsed externally",
      children: [{ type: "paragraph", content: "Child" }],
    }]);

    expect(imported.idMap.size).toBe(0);
    expect(imported.roots).toMatchObject([{
      id: expect.any(String),
      type: "paragraph",
      content: "Parsed externally",
      children: [{ type: "paragraph", content: "Child" }],
    }]);
    expect(getBlock).not.toHaveBeenCalled();
    getBlock.mockRestore();
    editor.destroy();
  });

});
