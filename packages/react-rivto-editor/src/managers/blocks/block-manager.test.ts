import type { ComponentType } from "react";
import { createTestCoreEditor as createEditor, createTestReactEditor as createReactEditor } from "../../test-utils";

import { DefaultBlockBehavior } from "../../block-behaviors/index";

const Renderer: ComponentType<{ blockId: string }> = () => null;

describe("BlockManager", () => {
  test("atomically registers and disposes model, renderer, and conversion command", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const dispose = editorView.runtime.blockTypes.register({
      definition: { type: "test.manager-block", metadata: { owner: "test" } },
      render: Renderer,
      slashCommand: { title: "Manager block" },
      separatesBlockElements: true,
    });

    editorView.slashCommands.execute("type.test.manager-block", { blockId: id });
    expect(editor.blocks.getBlockNode(id)?.type).toBe("test.manager-block");
    expect(editorView.runtime.renderers.get("test.manager-block")).toBe(Renderer);
    expect(editorView.runtime.blockTypes.separatesBlockElements("test.manager-block")).toBe(true);
    expect(editorView.runtime.blockTypes.getDefaultBlockElementSeparatorType()).toBe("test.manager-block");
    expect(editor.blockRegistry.get("test.manager-block")?.metadata).toEqual({ owner: "test" });

    expect(editorView.runtime.blockTypes.delete("test.manager-block")).toBe(true);
    expect(editorView.runtime.blockTypes.delete("test.manager-block")).toBe(false);
    dispose();
    expect(editor.blockRegistry.has("test.manager-block")).toBe(false);
    expect(editorView.runtime.renderers.has("test.manager-block")).toBe(false);
    expect(editorView.runtime.blockTypes.separatesBlockElements("test.manager-block")).toBe(false);
    editorView.runtime.destroy();
    editor.destroy();
  });

  test("rejects containment that disagrees with an existing core definition", async () => {
    const editor = await createEditor();
    editor.blockRegistry.defineBlock({
      type: "test.existing",
      metadata: { containment: { childOutline: "fixed" } },
    });
    const editorView = createReactEditor({ editor });

    expect(() => editorView.runtime.blockTypes.register({
      definition: { type: "test.existing", metadata: { containment: { childOutline: "free" } } },
      render: Renderer,
      behavior: new DefaultBlockBehavior(),
    })).toThrow(/containment.*does not match/);
    expect(editorView.runtime.renderers.has("test.existing")).toBe(false);

    editorView.runtime.destroy();
    editor.destroy();
  });

  test("applies recursive defaults and rejects invalid React mutations atomically", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    editorView.runtime.blockListProps.register({
      id: "collapse",
      defaults: { collapsed: false },
      isValid: (candidate) => typeof candidate.collapsed === "boolean",
    });

    const prepared = editorView.runtime.blocks.prepareInput([{
      type: "paragraph",
      children: [{ type: "paragraph", listProps: { custom: "kept" } }],
    }])[0]!;
    expect(prepared.listProps).toEqual({ collapsed: false });
    expect(prepared.children?.[0]?.listProps).toEqual({ collapsed: false, custom: "kept" });
    expect(editor.blocks.getBlocks()).toEqual([]);

    const parent = editorView.runtime.blocks.insertBlock(prepared).id;
    const child = editor.blocks.getBlockNode(parent)!.childIds[0]!;
    expect(editor.blocks.getBlockNode(parent)?.listProps).toEqual({ collapsed: false });
    expect(editor.blocks.getBlockNode(child)?.listProps).toEqual({ collapsed: false, custom: "kept" });

    expect(() => editorView.runtime.blocks.updateBlocks([
      { id: parent, patch: { listProps: { collapsed: true } } },
      { id: child, patch: { listProps: { collapsed: "invalid" } } },
      { id: "missing", patch: { listProps: { collapsed: true } } },
      { id: child, patch: { listProps: { custom: Number.POSITIVE_INFINITY } } },
    ])).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlockNode(parent)?.listProps.collapsed).toBe(false);
    expect(() => editorView.runtime.blocks.updateBlock("missing", {})).toThrow("Block missing not found");
    expect(editorView.runtime.blocks.deleteListProps(parent, ["collapsed"])).toBe(true);
    expect(editor.blocks.getBlockNode(parent)?.listProps).toEqual({});

    editorView.runtime.destroy();
    expect(editor.blockListProps.has("collapse")).toBe(false);
    expect(() => editorView.runtime.blockListProps.register({ id: "late" })).toThrow("React editor is destroyed");
    expect(editor.blockListProps.has("late")).toBe(false);
    editor.destroy();
  });

  test("rejects invalid descendants and repeated list-property deletions atomically", async () => {
    const editor = await createEditor();
    const editorView = createReactEditor({ editor });
    editorView.runtime.blockListProps.register({
      id: "pair",
      isValid: (candidate) => candidate.left === true || candidate.right === true,
    });

    const invalid = {
      type: "paragraph",
      children: [{ type: "paragraph", listProps: { left: false, right: false } }],
    };
    expect(() => editorView.runtime.blocks.prepareInput([invalid])).toThrow("Invalid block list properties");
    expect(() => editorView.runtime.blocks.insertBlock(invalid)).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlocks()).toEqual([]);

    const id = editorView.runtime.blocks.insertBlock({
      type: "paragraph",
      listProps: { left: true, right: true },
    }).id;
    expect(() => editorView.runtime.blocks.deleteListPropsBatch([
      { id, keys: ["left"] },
      { id, keys: ["right"] },
    ])).toThrow("Invalid block list properties");
    expect(editor.blocks.getBlockNode(id)?.listProps).toEqual({ left: true, right: true });

    editorView.runtime.destroy();
    editor.destroy();
  });
});
