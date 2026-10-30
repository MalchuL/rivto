/**
 * Verifies the OpenUI extension stays opt-in, keeps its source through slash
 * conversion, and exports that source on the clipboard.
 *
 * Drawing is covered by the demo. Jest maps the OpenUI packages to local
 * stand-ins so this file can load the extension without the browser renderer.
 *
 * @module
 */
import { defaultWritingBlockExtension, standardPreset } from "../built-ins/built-ins";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { OPENUI_BLOCK_TYPE, createOpenUiBlockInput, openuiExtension } from "./openui-block";

const SAMPLE_SOURCE = ["root = Stack([title])", 'title = TextContent("Hello", "large-heavy")'].join(
  "\n",
);

describe("openuiExtension", () => {
  test("is not installed by the standard preset", async () => {
    const editor = await createTestCoreEditor({ registerWritingBlock: false });
    const reactPanel = createTestReactEditor({ editor, extensions: [standardPreset()] });

    expect(editor.blockRegistry.has(OPENUI_BLOCK_TYPE)).toBe(false);
    expect(reactPanel.editor.renderers.has(OPENUI_BLOCK_TYPE)).toBe(false);

    reactPanel.editor.destroy();
    await editor.destroy();
  });

  test("registers a leaf OpenUI block and preserves source on slash conversion", async () => {
    const editor = await createTestCoreEditor({ registerWritingBlock: false });
    const reactPanel = createTestReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), openuiExtension()],
    });
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      content: SAMPLE_SOURCE,
    }).id;

    expect(editor.blockRegistry.get(OPENUI_BLOCK_TYPE)?.title).toBe("OpenUI");
    expect(reactPanel.editor.renderers.has(OPENUI_BLOCK_TYPE)).toBe(true);

    reactPanel.slashCommands.execute("type.openui", { blockId: id });

    expect(editor.blocks.getBlockNode(id)).toMatchObject({
      id,
      type: OPENUI_BLOCK_TYPE,
      content: SAMPLE_SOURCE,
    });
    expect(editor.blocks.getBlock(id)?.children).toEqual([]);

    reactPanel.editor.destroy();
    await editor.destroy();
  });

  test("exports the OpenUI program as plain text and a fenced markdown block", async () => {
    const editor = await createTestCoreEditor();
    const reactPanel = createTestReactEditor({ editor, extensions: [openuiExtension()] });
    const id = editor.blocks.insertBlock(createOpenUiBlockInput(SAMPLE_SOURCE)).id;
    const block = editor.blocks.getBlock(id)!;

    expect(reactPanel.editor.clipboardFormats.format([block])).toEqual({
      plain: SAMPLE_SOURCE,
      markdown: `\`\`\`openui\n${SAMPLE_SOURCE}\n\`\`\``,
      html: `<pre><code>${SAMPLE_SOURCE.replaceAll('"', "&quot;")}</code></pre>`,
    });

    reactPanel.editor.destroy();
    await editor.destroy();
  });
});
