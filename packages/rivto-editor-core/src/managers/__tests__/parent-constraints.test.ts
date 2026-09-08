/**
 * Parent/child placement constraints at insert, move, and snapshot load.
 *
 * @module
 */
import { createTestEditor as createRivtoEditor } from "../../editor/test-utils";
import type { Block } from "../../store/document-model/core/types";

const complete = (
  id: string,
  type: string,
  children: Block[] = [],
): Block => ({
  id,
  type,
  content: "",
  props: {},
  pluginData: {},
  listProps: {},
  children,
});

describe("block parent constraints", () => {
  test("rejects disallowed parents at insert, move, and load", () => {
    const editor = createRivtoEditor();
    editor.blocksRegistry.defineBlock({
      type: "note-only",
      allowedParents: ["note"],
    });
    editor.blocksRegistry.defineBlock({ type: "note" });

    expect(() => editor.blocks.insertBlock({ type: "note-only", content: "" }))
      .toThrow(/cannot be placed under document root/);

    const noteId = editor.blocks.insertBlock({
      type: "note",
      content: "Note",
      children: [{ id: "note-child", type: "note-only", content: "Child" }],
    });
    expect(editor.blocks.getParentId("note-child")).toBe(noteId);

    expect(() => editor.blocks.moveBlock("note-child", null))
      .toThrow(/cannot be placed under document root/);
    expect(editor.blocks.getParentId("note-child")).toBe(noteId);

    const paragraphId = editor.blocks.insertBlock({ type: "paragraph", content: "Sibling" }, noteId);
    expect(() => editor.blocks.moveBlock("note-child", paragraphId, "inside"))
      .toThrow(/cannot be placed under paragraph/);
    expect(editor.blocks.getParentId("note-child")).toBe(noteId);

    const before = editor.document.getSnapshot();
    expect(() => editor.document.loadSnapshot({
      version: 6,
      blocks: [complete("root-note-only", "note-only")],
    })).toThrow(/cannot be placed under document root/);
    expect(editor.document.getSnapshot()).toEqual(before);

    editor.destroy();
  });
});
