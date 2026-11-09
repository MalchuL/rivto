import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { defaultWritingBlockExtension } from "../built-ins/built-ins";
import { todoItemExtension } from "../todo-item/todo-item";
import { bentoExtension } from "./bento/bento";
import { kanbanExtension } from "./kanban/kanban";

it("removes the background processor when container registration fails", async () => {
  const editor = await createTestCoreEditor();
  editor.blockRegistry.defineBlock({ type: "bento" });
  const panel = createTestReactEditor({ editor });
  expect(() => panel.editor.extensions.install(bentoExtension())).toThrow();
  expect(editor.blocks.insertBlock({ type: "bento" }).listProps.style).toBeUndefined();
  panel.editor.destroy();
  editor.destroy();
});

it.each(["bento", "kanban", "todo-storage"])(
  "initializes %s theme on creation and conversion while preserving chosen colors",
  async (type) => {
    const editor = await createTestCoreEditor({ registerWritingBlock: false });
    const panel = createTestReactEditor({
      editor,
      extensions: [
        defaultWritingBlockExtension(),
        bentoExtension(),
        kanbanExtension(),
        todoItemExtension(),
      ],
    });
    const partial = editor.blocks.insertBlock({
      type,
      listProps: { style: { text: { fontSize: 123 }, background: { color: "#123456" } } },
    });
    expect(partial.listProps.style).toEqual({
      text: { fontSize: 123 },
      background: { color: "#123456" },
    });
    const created = editor.blocks.insertBlock({ type });
    expect(created.listProps.style).toEqual({ background: { color: "#eceef6" } });
    const transparent = editor.blocks.insertBlock({
      type,
      listProps: { style: { text: { color: "#ff0000" }, background: { color: "#00000000" } } },
    });
    expect(transparent.listProps.style).toEqual({
      text: { color: "#ff0000" },
      background: { color: "#00000000" },
    });
    const source = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { style: { text: { color: "#0000ff" } } },
    });
    editor.history.clear();
    editor.blocks.setBlockType(source.id, type);
    expect(editor.blocks.getBlockNode(source.id)?.listProps.style).toEqual({
      text: { color: "#0000ff" },
      background: { color: "#eceef6" },
    });
    editor.history.undo();
    expect(editor.blocks.getBlockNode(source.id)?.listProps.style).toEqual({
      text: { color: "#0000ff" },
    });
    editor.history.redo();
    expect(editor.blocks.getBlockNode(source.id)?.listProps.style).toEqual({
      text: { color: "#0000ff" },
      background: { color: "#eceef6" },
    });
    const custom = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { style: { background: { color: "#123456" } } },
    });
    editor.blocks.setBlockType(custom.id, type);
    expect(editor.blocks.getBlockNode(custom.id)?.listProps.style).toEqual({
      background: { color: "#123456" },
    });
    panel.editor.destroy();
    editor.destroy();
  },
);
