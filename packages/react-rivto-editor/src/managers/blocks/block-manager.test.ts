import { createTestCoreEditor as createEditor } from "../../test-utils";
import type { ComponentType } from "react";
import { createReactEditor } from "../../react-editor";
import { BaseBlockView } from "../../views";

const Renderer: ComponentType<{ blockId: string }> = () => null;

describe("BlockManager", () => {
  test("atomically registers and disposes model, renderer, and conversion command", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const dispose = reactEditor.blockTypes.register({
      definition: { type: "test.manager-block", metadata: { owner: "test" } },
      render: Renderer,
      slashCommand: { title: "Manager block" },
      separatesBlockElements: true,
    });

    reactEditor.slashCommands.execute("type.test.manager-block", { blockId: id });
    expect(editor.blocks.getBlockNode(id)?.type).toBe("test.manager-block");
    expect(reactEditor.renderers.get("test.manager-block")).toBe(Renderer);
    expect(reactEditor.blockTypes.separatesBlockElements("test.manager-block")).toBe(true);
    expect(reactEditor.blockTypes.getDefaultBlockElementSeparatorType()).toBe("test.manager-block");
    expect(editor.blockRegistry.get("test.manager-block")?.metadata).toEqual({ owner: "test" });

    expect(reactEditor.blockTypes.delete("test.manager-block")).toBe(true);
    expect(reactEditor.blockTypes.delete("test.manager-block")).toBe(false);
    dispose();
    expect(editor.blockRegistry.has("test.manager-block")).toBe(false);
    expect(reactEditor.renderers.has("test.manager-block")).toBe(false);
    expect(reactEditor.blockTypes.separatesBlockElements("test.manager-block")).toBe(false);
    reactEditor.destroy();
    editor.destroy();
  });

  test("rejects containment that disagrees with an existing core definition", () => {
    const editor = createEditor();
    editor.blockRegistry.defineBlock({
      type: "test.existing",
      metadata: { containment: { childOutline: "fixed" } },
    });
    const reactEditor = createReactEditor({ editor });

    expect(() => reactEditor.blockTypes.register({
      definition: { type: "test.existing", metadata: { containment: { childOutline: "free" } } },
      render: Renderer,
      view: new BaseBlockView(),
    })).toThrow(/containment.*does not match/);
    expect(reactEditor.renderers.has("test.existing")).toBe(false);

    reactEditor.destroy();
    editor.destroy();
  });

  test("applies recursive defaults and rejects invalid React mutations atomically", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    reactEditor.blockListProps.register({
      id: "collapse",
      defaults: { collapsed: false },
      isValid: (candidate) => typeof candidate.collapsed === "boolean",
    });

    const prepared = reactEditor.blocks.prepareInput([{
      type: "paragraph",
      children: [{ type: "paragraph", listProps: { custom: "kept" } }],
    }])[0]!;
    expect(prepared.listProps).toEqual({ collapsed: false });
    expect(prepared.children?.[0]?.listProps).toEqual({ collapsed: false, custom: "kept" });
    expect(editor.blocks.getBlocks()).toEqual([]);

    const parent = reactEditor.blocks.insertBlock(prepared).id;
    const child = editor.blocks.getChildIds(parent)[0]!;
    expect(editor.blocks.getBlockNode(parent)?.listProps).toEqual({ collapsed: false });
    expect(editor.blocks.getBlockNode(child)?.listProps).toEqual({ collapsed: false, custom: "kept" });

    expect(() => reactEditor.blocks.updateBlocks([
      { id: parent, patch: { listProps: { collapsed: true } } },
      { id: child, patch: { listProps: { collapsed: "invalid" } } },
      { id: "missing", patch: { listProps: { collapsed: true } } },
      { id: child, patch: { listProps: { custom: Number.POSITIVE_INFINITY } } },
    ])).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlockNode(parent)?.listProps.collapsed).toBe(false);
    expect(() => reactEditor.blocks.updateBlock("missing", {})).toThrow("Block missing not found");
    expect(reactEditor.blocks.deleteListProps(parent, ["collapsed"])).toBe(true);
    expect(editor.blocks.getBlockNode(parent)?.listProps).toEqual({});

    reactEditor.destroy();
    expect(editor.blockListProps.has("collapse")).toBe(false);
    expect(() => reactEditor.blockListProps.register({ id: "late" })).toThrow("React editor is destroyed");
    expect(editor.blockListProps.has("late")).toBe(false);
    editor.destroy();
  });

  test("rejects invalid descendants and repeated list-property deletions atomically", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    reactEditor.blockListProps.register({
      id: "pair",
      isValid: (candidate) => candidate.left === true || candidate.right === true,
    });

    const invalid = {
      type: "paragraph",
      children: [{ type: "paragraph", listProps: { left: false, right: false } }],
    };
    expect(() => reactEditor.blocks.prepareInput([invalid])).toThrow("Invalid block list properties");
    expect(() => reactEditor.blocks.insertBlock(invalid)).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlocks()).toEqual([]);

    const id = reactEditor.blocks.insertBlock({
      type: "paragraph",
      listProps: { left: true, right: true },
    }).id;
    expect(() => reactEditor.blocks.deleteListPropsBatch([
      { id, keys: ["left"] },
      { id, keys: ["right"] },
    ])).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlockNode(id)?.listProps).toEqual({ left: true, right: true });

    reactEditor.destroy();
    editor.destroy();
  });
});
