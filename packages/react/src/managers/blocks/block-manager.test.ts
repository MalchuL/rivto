import { createRivtoEditor as createEditor } from "@chulane/rivto";
import type { ComponentType } from "react";
import { createReactEditor } from "../../react-editor";

const Renderer: ComponentType<{ blockId: string }> = () => null;

describe("BlockManager", () => {
  test("atomically registers and disposes model, renderer, and conversion command", () => {
    const editor = createEditor();
    const reactEditor = createReactEditor({ editor });
    const id = editor.insertBlock({ type: "paragraph" });
    const dispose = reactEditor.blocks.register({
      definition: { type: "test.manager-block" },
      render: Renderer,
      slashCommand: { title: "Manager block" },
    });

    reactEditor.slashCommands.execute("type.test.manager-block", { blockId: id });
    expect(editor.getBlock(id)?.type).toBe("test.manager-block");
    expect(reactEditor.renderers.get("test.manager-block")).toBe(Renderer);

    expect(reactEditor.blocks.delete("test.manager-block")).toBe(true);
    expect(reactEditor.blocks.delete("test.manager-block")).toBe(false);
    dispose();
    expect(editor.blocks.has("test.manager-block")).toBe(false);
    expect(reactEditor.renderers.has("test.manager-block")).toBe(false);
    reactEditor.destroy();
    editor.destroy();
  });
});
