import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { defaultWritingBlockExtension } from "../built-ins/built-ins";
import { todoItemExtension } from "../todo-item/todo-item";
import { bentoExtension } from "./bento/bento";
import { kanbanExtension } from "./kanban/kanban";

it.each(["bento", "kanban", "todo-storage"])(
  "leaves %s background unset on creation and conversion while preserving chosen colors",
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
    expect(created.listProps.style).toBeUndefined();
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
    });
    editor.history.undo();
    expect(editor.blocks.getBlockNode(source.id)?.listProps.style).toEqual({
      text: { color: "#0000ff" },
    });
    editor.history.redo();
    expect(editor.blocks.getBlockNode(source.id)?.listProps.style).toEqual({
      text: { color: "#0000ff" },
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
