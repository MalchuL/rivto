import { createTestCoreEditor as createRivtoEditor } from "../../test-utils";
import { renderToStaticMarkup } from "react-dom/server";
import { createReactEditor } from "../../react-editor";
import { defaultWritingBlockExtension } from "../page/default-writing-block";
import {
  SEPARATOR_BLOCK_TYPE,
  SeparatorBlock,
  separatorBlockExtension,
} from "./separator-block";

describe("separator block extension", () => {
  test("registers a contentless accessible separator renderer", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
    });

    expect(editor.blocksRegistry.has(SEPARATOR_BLOCK_TYPE)).toBe(true);
    expect(reactEditor.blocks.separatesBlockElements(SEPARATOR_BLOCK_TYPE)).toBe(true);
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('role="separator"');
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('data-separator-block="true"');

    reactEditor.destroy();
    editor.destroy();
  });

  test("inserts a separator after content and focuses a new writing block", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
    });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "Keep me" });
    editor.selection.set([{
      type: "text",
      anchor: { blockId: first, offset: 0 },
      head: { blockId: first, offset: 0 },
    }]);

    reactEditor.slashCommands.execute("block.separator.insert", { blockId: first });

    const roots = editor.blocks.getRootIds();
    expect(roots).toHaveLength(3);
    expect(editor.blocks.getBlock(roots[0]!)?.content).toBe("Keep me");
    expect(editor.blocks.getBlock(roots[1]!)?.type).toBe(SEPARATOR_BLOCK_TYPE);
    expect(editor.blocks.getBlock(roots[2]!)?.type).toBe("paragraph");
    expect(editor.blocks.getBlock(roots[2]!)?.content).toBe("");

    reactEditor.destroy();
    editor.destroy();
  });

  test("converts an empty leaf into a separator before inserting writing", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
    });
    const empty = editor.blocks.insertBlock({ type: "paragraph", content: "" });
    editor.selection.set([{
      type: "text",
      anchor: { blockId: empty, offset: 0 },
      head: { blockId: empty, offset: 0 },
    }]);

    reactEditor.slashCommands.execute("block.separator.insert", { blockId: empty });

    expect(editor.blocks.getBlock(empty)?.type).toBe(SEPARATOR_BLOCK_TYPE);
    const roots = editor.blocks.getRootIds();
    expect(roots[0]).toBe(empty);
    expect(editor.blocks.getBlock(roots[1]!)?.type).toBe("paragraph");

    reactEditor.destroy();
    editor.destroy();
  });
});
