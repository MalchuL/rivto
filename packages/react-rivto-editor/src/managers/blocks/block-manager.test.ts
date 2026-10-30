import type { ComponentType } from "react";
import {
  createTestCoreEditor as createEditor,
  createTestReactEditor as createReactEditor,
} from "../../test-utils";

const Renderer: ComponentType<{ blockId: string }> = () => null;

describe("BlockManager", () => {
  test("atomically registers and disposes model, renderer, and conversion command", async () => {
    const editor = await createEditor();
    const reactPanel = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const dispose = reactPanel.editor.blockTypes.register({
      definition: { type: "test.manager-block", metadata: { owner: "test" } },
      render: Renderer,
      slashCommand: { title: "Manager block" },
      separatesBlockElements: true,
    });

    reactPanel.slashCommands.execute("type.test.manager-block", { blockId: id });
    expect(editor.blocks.getBlockNode(id)?.type).toBe("test.manager-block");
    expect(reactPanel.editor.renderers.get("test.manager-block")).toBe(Renderer);
    expect(reactPanel.editor.blockTypes.separatesBlockElements("test.manager-block")).toBe(true);
    expect(reactPanel.editor.blockTypes.getDefaultBlockElementSeparatorType()).toBe(
      "test.manager-block",
    );
    expect(editor.blockRegistry.get("test.manager-block")?.metadata).toEqual({ owner: "test" });

    expect(reactPanel.editor.blockTypes.delete("test.manager-block")).toBe(true);
    expect(reactPanel.editor.blockTypes.delete("test.manager-block")).toBe(false);
    dispose();
    expect(editor.blockRegistry.has("test.manager-block")).toBe(false);
    expect(reactPanel.editor.renderers.has("test.manager-block")).toBe(false);
    expect(reactPanel.editor.blockTypes.separatesBlockElements("test.manager-block")).toBe(false);
    reactPanel.editor.destroy();
    editor.destroy();
  });

  test("rejects an existing core definition without changing its model rules or metadata", async () => {
    const editor = await createEditor();
    const metadata = {
      ["test.geometry"]: { dropAxis: "horizontal", fixed: true },
      custom: { values: [1, 2] },
    };
    editor.blockRegistry.defineBlock({
      type: "test.existing",
      title: "Existing",
      metadata,
    });
    const definition = editor.blockRegistry.get("test.existing")!;
    const reactPanel = createReactEditor({ editor });
    const incoming = {
      ["test.geometry"]: { acceptsDropContainer: true },
      custom: { values: [3] },
    };
    expect(() =>
      reactPanel.editor.blockTypes.register({
        definition: { type: "test.existing", metadata: incoming },
        render: Renderer,
      }),
    ).toThrow("Block type test.existing is already registered");
    expect(editor.blockRegistry.get("test.existing")).toBe(definition);
    expect(definition.title).toBe("Existing");
    expect(definition.metadata).toBe(metadata);
    expect(metadata).toEqual({
      ["test.geometry"]: { dropAxis: "horizontal", fixed: true },
      custom: { values: [1, 2] },
    });
    expect(incoming).toEqual({
      ["test.geometry"]: { acceptsDropContainer: true },
      custom: { values: [3] },
    });
    expect(reactPanel.editor.renderers.has("test.existing")).toBe(false);
    reactPanel.editor.destroy();
    editor.destroy();
  });

  test("applies recursive defaults and rejects invalid React mutations atomically", async () => {
    const editor = await createEditor();
    const reactPanel = createReactEditor({ editor });
    reactPanel.editor.blockListProps.register({
      id: "collapse",
      defaults: { collapsed: false },
      isValid: (candidate) => typeof candidate.collapsed === "boolean",
    });

    const prepared = reactPanel.editor.blocks.prepareInput([
      {
        type: "paragraph",
        children: [{ type: "paragraph", listProps: { custom: "kept" } }],
      },
    ])[0]!;
    expect(prepared.listProps).toEqual({ collapsed: false });
    expect(prepared.children?.[0]?.listProps).toEqual({ collapsed: false, custom: "kept" });
    expect(editor.blocks.getBlocks()).toEqual([]);

    const parent = reactPanel.editor.blocks.insertBlock(prepared).id;
    const child = editor.blocks.getBlockNode(parent)!.childIds[0]!;
    expect(editor.blocks.getBlockNode(parent)?.listProps).toEqual({ collapsed: false });
    expect(editor.blocks.getBlockNode(child)?.listProps).toEqual({
      collapsed: false,
      custom: "kept",
    });

    expect(() =>
      reactPanel.editor.blocks.updateBlocks([
        { id: parent, patch: { listProps: { collapsed: true } } },
        { id: child, patch: { listProps: { collapsed: "invalid" } } },
        { id: "missing", patch: { listProps: { collapsed: true } } },
        { id: child, patch: { listProps: { custom: Number.POSITIVE_INFINITY } } },
      ]),
    ).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlockNode(parent)?.listProps.collapsed).toBe(false);
    expect(() => reactPanel.editor.blocks.updateBlock("missing", {})).toThrow(
      "Block missing not found",
    );
    expect(reactPanel.editor.blocks.deleteListProps(parent, ["collapsed"])).toBe(true);
    expect(editor.blocks.getBlockNode(parent)?.listProps).toEqual({});

    reactPanel.editor.destroy();
    expect(editor.blockListProps.has("collapse")).toBe(false);
    expect(() => reactPanel.editor.blockListProps.register({ id: "late" })).toThrow(
      "React editor is destroyed",
    );
    expect(editor.blockListProps.has("late")).toBe(false);
    editor.destroy();
  });

  test("rejects invalid descendants and repeated list-property deletions atomically", async () => {
    const editor = await createEditor();
    const reactPanel = createReactEditor({ editor });
    reactPanel.editor.blockListProps.register({
      id: "pair",
      isValid: (candidate) => candidate.left === true || candidate.right === true,
    });

    const invalid = {
      type: "paragraph",
      children: [{ type: "paragraph", listProps: { left: false, right: false } }],
    };
    expect(() => reactPanel.editor.blocks.prepareInput([invalid])).toThrow(
      "Invalid block list properties",
    );
    expect(() => reactPanel.editor.blocks.insertBlock(invalid)).toThrow(
      "Invalid block list properties",
    );
    expect(editor.blocks.getBlocks()).toEqual([]);

    const id = reactPanel.editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { left: true, right: true },
    }).id;
    expect(() =>
      reactPanel.editor.blocks.deleteListPropsBatch([
        { id, keys: ["left"] },
        { id, keys: ["right"] },
      ]),
    ).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlockNode(id)?.listProps).toEqual({ left: true, right: true });

    reactPanel.editor.destroy();
    editor.destroy();
  });
});
