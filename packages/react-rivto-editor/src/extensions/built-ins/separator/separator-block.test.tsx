import { createCaretSelection } from "@chulane/rivto";
import { createTestCoreEditor as createRivtoEditor } from "../../../test-utils";
import { renderToStaticMarkup } from "react-dom/server";
import { createReactEditor } from "../../../react-editor";
import { defaultWritingBlockExtension } from "../built-ins";
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

    expect(editor.blockRegistry.has(SEPARATOR_BLOCK_TYPE)).toBe(true);
    expect(reactEditor.blockTypes.separatesBlockElements(SEPARATOR_BLOCK_TYPE)).toBe(true);
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('role="separator"');
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('data-separator-block="true"');
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('data-block-selection-anchor=""');

    reactEditor.destroy();
    editor.destroy();
  });

  test("inserts a separator after content and focuses a new writing block", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
    });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "Keep me" }).id;
    reactEditor.selection.set(createCaretSelection(first, 0));

    reactEditor.slashCommands.execute("block.separator.insert", { blockId: first });

    const roots = editor.blocks.getRootIds();
    expect(roots).toHaveLength(3);
    expect(editor.blocks.getBlockNode(roots[0]!)?.content).toBe("Keep me");
    expect(editor.blocks.getBlockNode(roots[1]!)?.type).toBe(SEPARATOR_BLOCK_TYPE);
    expect(editor.blocks.getBlockNode(roots[2]!)?.type).toBe("paragraph");
    expect(editor.blocks.getBlockNode(roots[2]!)?.content).toBe("");

    reactEditor.destroy();
    editor.destroy();
  });

  test("converts an empty leaf into a separator before inserting writing", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
    });
    const empty = editor.blocks.insertBlock({ type: "paragraph", content: "" }).id;
    reactEditor.selection.set(createCaretSelection(empty, 0));

    reactEditor.slashCommands.execute("block.separator.insert", { blockId: empty });

    expect(editor.blocks.getBlockNode(empty)?.type).toBe(SEPARATOR_BLOCK_TYPE);
    const roots = editor.blocks.getRootIds();
    expect(roots[0]).toBe(empty);
    expect(editor.blocks.getBlockNode(roots[1]!)?.type).toBe("paragraph");

    reactEditor.destroy();
    editor.destroy();
  });
});
