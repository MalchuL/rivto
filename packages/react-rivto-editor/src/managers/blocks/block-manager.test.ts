import { createTestReactEditor as createReactEditor } from "../../test-utils";
import { createTestCoreEditor as createEditor } from "../../test-utils";
import type { ComponentType } from "react";

import { BaseBlockView } from "../../views";

const Renderer: ComponentType<{ blockId: string }> = () => null;

describe("BlockManager", () => {
  test("atomically registers and disposes model, renderer, and conversion command", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const dispose = editorView.blockTypes.register({
      definition: { type: "test.manager-block", metadata: { owner: "test" } },
      render: Renderer,
      slashCommand: { title: "Manager block" },
      separatesBlockElements: true,
    });

    editorView.slashCommands.execute("type.test.manager-block", { blockId: id });
    expect(editor.blocks.getBlockNode(id)?.type).toBe("test.manager-block");
    expect(editorView.renderers.get("test.manager-block")).toBe(Renderer);
    expect(editorView.blockTypes.separatesBlockElements("test.manager-block")).toBe(true);
    expect(editorView.blockTypes.getDefaultBlockElementSeparatorType()).toBe("test.manager-block");
    expect(editor.blockRegistry.get("test.manager-block")?.metadata).toEqual({ owner: "test" });

    expect(editorView.blockTypes.delete("test.manager-block")).toBe(true);
    expect(editorView.blockTypes.delete("test.manager-block")).toBe(false);
    dispose();
    expect(editor.blockRegistry.has("test.manager-block")).toBe(false);
    expect(editorView.renderers.has("test.manager-block")).toBe(false);
    expect(editorView.blockTypes.separatesBlockElements("test.manager-block")).toBe(false);
    editorView.destroy();
    editor.destroy();
  });

  test("rejects containment that disagrees with an existing core definition", async () => {
    const editor = await createEditor();
    editor.blockRegistry.defineBlock({
      type: "test.existing",
      metadata: { containment: { childOutline: "fixed" } },
    });
    const editorView = createReactEditor({ editor });

    expect(() => editorView.blockTypes.register({
      definition: { type: "test.existing", metadata: { containment: { childOutline: "free" } } },
      render: Renderer,
      view: new BaseBlockView(),
    })).toThrow(/containment.*does not match/);
    expect(editorView.renderers.has("test.existing")).toBe(false);

    editorView.destroy();
    editor.destroy();
  });

  test("applies recursive defaults and rejects invalid React mutations atomically", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    editorView.blockListProps.register({
      id: "collapse",
      defaults: { collapsed: false },
      isValid: (candidate) => typeof candidate.collapsed === "boolean",
    });

    const prepared = editorView.blocks.prepareInput([{
      type: "paragraph",
      children: [{ type: "paragraph", listProps: { custom: "kept" } }],
    }])[0]!;
    expect(prepared.listProps).toEqual({ collapsed: false });
    expect(prepared.children?.[0]?.listProps).toEqual({ collapsed: false, custom: "kept" });
    expect(editor.blocks.getBlocks()).toEqual([]);

    const parent = editorView.blocks.insertBlock(prepared).id;
    const child = editor.blocks.getBlockNode(parent)!.childIds[0]!;
    expect(editor.blocks.getBlockNode(parent)?.listProps).toEqual({ collapsed: false });
    expect(editor.blocks.getBlockNode(child)?.listProps).toEqual({ collapsed: false, custom: "kept" });

    expect(() => editorView.blocks.updateBlocks([
      { id: parent, patch: { listProps: { collapsed: true } } },
      { id: child, patch: { listProps: { collapsed: "invalid" } } },
      { id: "missing", patch: { listProps: { collapsed: true } } },
      { id: child, patch: { listProps: { custom: Number.POSITIVE_INFINITY } } },
    ])).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlockNode(parent)?.listProps.collapsed).toBe(false);
    expect(() => editorView.blocks.updateBlock("missing", {})).toThrow("Block missing not found");
    expect(editorView.blocks.deleteListProps(parent, ["collapsed"])).toBe(true);
    expect(editor.blocks.getBlockNode(parent)?.listProps).toEqual({});

    editorView.destroy();
    expect(editor.blockListProps.has("collapse")).toBe(false);
    expect(() => editorView.blockListProps.register({ id: "late" })).toThrow("React editor is destroyed");
    expect(editor.blockListProps.has("late")).toBe(false);
    editor.destroy();
  });

  test("rejects invalid descendants and repeated list-property deletions atomically", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    editorView.blockListProps.register({
      id: "pair",
      isValid: (candidate) => candidate.left === true || candidate.right === true,
    });

    const invalid = {
      type: "paragraph",
      children: [{ type: "paragraph", listProps: { left: false, right: false } }],
    };
    expect(() => editorView.blocks.prepareInput([invalid])).toThrow("Invalid block list properties");
    expect(() => editorView.blocks.insertBlock(invalid)).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlocks()).toEqual([]);

    const id = editorView.blocks.insertBlock({
      type: "paragraph",
      listProps: { left: true, right: true },
    }).id;
    expect(() => editorView.blocks.deleteListPropsBatch([
      { id, keys: ["left"] },
      { id, keys: ["right"] },
    ])).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlockNode(id)?.listProps).toEqual({ left: true, right: true });

    editorView.destroy();
    editor.destroy();
  });
});
