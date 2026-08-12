import { createTestCoreEditor as createEditor } from "../../test-utils";
import type { ComponentType } from "react";
import { createReactEditor } from "../../react-editor";

const Renderer: ComponentType<{ blockId: string }> = () => null;

describe("BlockManager", () => {
  test("atomically registers and disposes model, renderer, and conversion command", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const id = editor.blocks.insertBlock({ type: "paragraph" });
    const dispose = reactEditor.blocks.register({
      definition: { type: "test.manager-block" },
      render: Renderer,
      slashCommand: { title: "Manager block" },
      separatesBlockElements: true,
    });

    reactEditor.slashCommands.execute("type.test.manager-block", { blockId: id });
    expect(editor.blocks.getBlock(id)?.type).toBe("test.manager-block");
    expect(reactEditor.renderers.get("test.manager-block")).toBe(Renderer);
    expect(reactEditor.blocks.separatesBlockElements("test.manager-block")).toBe(true);
    expect(reactEditor.blocks.getDefaultBlockElementSeparatorType()).toBe("test.manager-block");

    expect(reactEditor.blocks.delete("test.manager-block")).toBe(true);
    expect(reactEditor.blocks.delete("test.manager-block")).toBe(false);
    dispose();
    expect(editor.blocksRegistry.has("test.manager-block")).toBe(false);
    expect(reactEditor.renderers.has("test.manager-block")).toBe(false);
    expect(reactEditor.blocks.separatesBlockElements("test.manager-block")).toBe(false);
    reactEditor.destroy();
    editor.destroy();
  });

  test("applies recursive defaults and filters invalid React mutations", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    reactEditor.blocks.registerListProps({
      id: "collapse",
      defaults: { collapsed: false },
      validate: (candidate) => typeof candidate.collapsed === "boolean",
    });

    const parent = reactEditor.blocks.insertBlock({
      type: "paragraph",
      children: [{ type: "paragraph", listProps: { custom: "kept" } }],
    });
    const child = editor.blocks.getChildIds(parent)[0]!;
    expect(editor.blocks.getBlock(parent)?.listProps).toEqual({ collapsed: false });
    expect(editor.blocks.getBlock(child)?.listProps).toEqual({ collapsed: false, custom: "kept" });

    const result = reactEditor.blocks.updateBlocks([
      { id: parent, patch: { listProps: { collapsed: true } } },
      { id: child, patch: { listProps: { collapsed: "invalid" } } },
      { id: "missing", patch: { listProps: { collapsed: true } } },
      { id: child, patch: { listProps: { custom: Number.POSITIVE_INFINITY } } },
    ]);
    expect(result.results).toEqual([
      { index: 0, id: parent, status: "applied" },
      { index: 1, id: child, status: "skipped", reason: "invalid" },
      { index: 2, id: "missing", status: "skipped", reason: "missing" },
      { index: 3, id: child, status: "skipped", reason: "invalid" },
    ]);
    expect(editor.blocks.getBlock(parent)?.listProps.collapsed).toBe(true);
    expect(reactEditor.blocks.deleteListProps(parent, ["collapsed"])).toBe(true);
    expect(editor.blocks.getBlock(parent)?.listProps).toEqual({});

    reactEditor.destroy();
    editor.destroy();
  });
});
