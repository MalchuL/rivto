import { createRivtoEditor } from "@chulane/rivto";
import { renderToStaticMarkup } from "react-dom/server";
import { createReactEditor } from "../../react-editor";
import {
  SEPARATOR_BLOCK_TYPE,
  SeparatorBlock,
  separatorBlockExtension,
} from "./separator-block";

describe("separator block extension", () => {
  test("registers a contentless accessible separator renderer", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor, extensions: [separatorBlockExtension()] });

    expect(editor.blocksRegistry.has(SEPARATOR_BLOCK_TYPE)).toBe(true);
    expect(reactEditor.blocks.separatesBlockElements(SEPARATOR_BLOCK_TYPE)).toBe(true);
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('role="separator"');
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('data-separator-block="true"');

    reactEditor.destroy();
    expect(editor.blocksRegistry.has(SEPARATOR_BLOCK_TYPE)).toBe(false);
    editor.destroy();
  });

  test("inserts a separator and writable paragraph atomically from slash", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor, extensions: [separatorBlockExtension()] });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "Keep me" });
    editor.history.clear();

    reactEditor.slashCommands.execute("block.separator.insert", { blockId: first });

    const roots = editor.blocks.getBlocks();
    expect(roots.map((block) => block.type)).toEqual(["paragraph", SEPARATOR_BLOCK_TYPE, "paragraph"]);
    expect(roots[0]?.content).toBe("Keep me");
    expect(roots[1]).toMatchObject({ content: "", listProps: { type: "list", checked: false } });
    expect(editor.selection.get()).toMatchObject([{
      type: "text",
      anchor: { blockId: roots[2]?.id, offset: 0 },
      head: { blockId: roots[2]?.id, offset: 0 },
    }]);
    expect(editor.clipboard.copy([{ type: "block", blockIds: [roots[1]!.id], anchorBlockId: roots[1]!.id, focusBlockId: roots[1]!.id }])?.markdown).toBe("---");

    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id: first, content: "Keep me" }]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("converts an empty leaf instead of leaving an extra blank block", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor, extensions: [separatorBlockExtension()] });
    const empty = editor.blocks.insertBlock({ type: "paragraph", content: "" });

    reactEditor.slashCommands.execute("block.separator.insert", { blockId: empty });

    expect(editor.blocks.getBlocks().map((block) => block.type)).toEqual([SEPARATOR_BLOCK_TYPE, "paragraph"]);
    expect(editor.blocks.getBlock(empty)?.type).toBe(SEPARATOR_BLOCK_TYPE);
    reactEditor.destroy();
    editor.destroy();
  });
});
