/**
 * Verifies TODO extension registration, dynamic metadata, validation, prompt
 * configuration, and custom modal wiring without duplicating browser event
 * coverage owned by Playwright.
 *
 * @module
 */
import type { ReactElement } from "react";
import { createReactEditor } from "../../react-editor";
import { createTestCoreEditor as createRivtoEditor } from "../../test-utils";
import { indentBlocks } from "../../views";
import {
  TODO_ITEM_BLOCK_TYPE,
  TODO_STORAGE_BLOCK_TYPE,
  type TodoItemPropertiesModalProps,
  todoItemExtension,
} from "./todo-item";

describe("todoItemExtension", () => {
  test("registers fresh validated TODO metadata for every creation", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor, extensions: [todoItemExtension()] });

    const first = editor.blocks.insertBlock({ type: TODO_ITEM_BLOCK_TYPE, content: "First" }).id;
    const second = editor.blocks.insertBlock({ type: TODO_ITEM_BLOCK_TYPE, content: "Second" }).id;
    const firstProps = editor.blocks.getBlockNode(first)?.props;
    const secondProps = editor.blocks.getBlockNode(second)?.props;

    expect(firstProps).toMatchObject({
      status: "todo",
      description: "",
      priority: 4,
      project: "",
    });
    expect(firstProps?.createdAt).toBe(firstProps?.updatedAt);
    expect(secondProps).not.toBe(firstProps);
    expect(String(firstProps?.createdAt)).toMatch(/Z$/);
    expect(() => editor.blocks.updateBlock(first, { props: { priority: 5 } })).toThrow();
    expect(() => editor.blocks.updateBlock(first, { props: { updatedAt: "2026-01-01" } })).toThrow();

    reactEditor.destroy();
    editor.destroy();
  });

  test("rejects invalid and conflicting prompt aliases", () => {
    expect(() => todoItemExtension({ prompts: { todo: [""] } })).toThrow(/non-empty/);
    expect(() => todoItemExtension({ prompts: { doing: ["in progress"] } })).toThrow(/whitespace/);
    expect(() => todoItemExtension({ prompts: { done: ["todo"] } })).toThrow(/conflicting/);
    expect(() => todoItemExtension({ prompts: { todo: ["task", "task"] } })).not.toThrow();
  });

  test("converts a leaf to storage in place and rejects populated containers", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor, extensions: [todoItemExtension()] });
    const empty = editor.blocks.insertBlock({ type: "paragraph", content: "" }).id;
    reactEditor.slashCommands.execute("type.todo-storage", { blockId: empty });
    expect(editor.blocks.getBlockNode(empty)?.type).toBe(TODO_STORAGE_BLOCK_TYPE);

    const populated = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Keep me",
      children: [{ type: "paragraph", content: "Keep child" }],
    }, empty).id;
    expect(() => reactEditor.slashCommands.execute("type.todo-storage", { blockId: populated }))
      .toThrow(/unavailable/);
    expect(editor.blocks.getBlock(populated)).toMatchObject({
      type: "paragraph",
      content: "Keep me",
      children: [{ content: "Keep child" }],
    });
    expect(editor.blocks.getRootIds().map((id) => editor.blocks.getBlockNode(id)?.type)).toEqual([
      TODO_STORAGE_BLOCK_TYPE,
      "paragraph",
    ]);
    expect(reactEditor.views.resolve(empty).dropAxis).toBe("vertical");
    expect(editor.blockRegistry.get(TODO_STORAGE_BLOCK_TYPE)?.metadata).toEqual({
      containment: { childOutline: "free", outlineFloor: true },
    });

    const firstTodo = editor.blocks.insertBlock({ type: TODO_ITEM_BLOCK_TYPE, content: "First" }).id;
    const nestedTodo = editor.blocks.insertBlock({ type: TODO_ITEM_BLOCK_TYPE, content: "Nested" }, firstTodo).id;
    editor.blocks.moveBlocks([firstTodo, nestedTodo], empty, "inside");
    indentBlocks(reactEditor, [nestedTodo]);
    expect(editor.blocks.getParentId(nestedTodo)).toBe(firstTodo);

    reactEditor.destroy();
    editor.destroy();
  });

  test("wires a supplied properties modal into the registered renderer", () => {
    const editor = createRivtoEditor();
    const CustomModal = (_props: TodoItemPropertiesModalProps) => null;
    const reactEditor = createReactEditor({
      editor,
      extensions: [todoItemExtension({ propertiesModal: CustomModal })],
    });
    const Renderer = reactEditor.renderers.get(TODO_ITEM_BLOCK_TYPE) as (
      props: { readonly blockId: string },
    ) => ReactElement<{ readonly propertiesModal: unknown }>;

    expect(Renderer({ blockId: "todo" }).props.propertiesModal).toBe(CustomModal);

    reactEditor.destroy();
    editor.destroy();
  });
});
