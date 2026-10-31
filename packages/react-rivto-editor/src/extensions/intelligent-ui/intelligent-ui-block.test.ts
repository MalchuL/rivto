/**
 * Verifies the Intelligent UI extension stays opt-in, keeps its source through
 * slash conversion, and exports that source on the clipboard.
 *
 * Running a program is covered by the demo. This file does not start a browser
 * renderer.
 *
 * @module
 */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { defaultWritingBlockExtension, standardPreset } from "../built-ins/built-ins";
import {
  INTELLIGENT_UI_BLOCK_TYPE,
  createIntelligentUiBlockInput,
  intelligentUiExtension,
} from "./intelligent-ui-block";

const SAMPLE_SOURCE = ["root = Col([title])", 'title = Title("Hello", "lg")'].join("\n");

describe("intelligentUiExtension", () => {
  test("is not installed by the standard preset", async () => {
    const editor = await createTestCoreEditor({ registerWritingBlock: false });
    const reactPanel = createTestReactEditor({
      editor,
      extensions: [standardPreset()],
    });

    expect(editor.blockRegistry.has(INTELLIGENT_UI_BLOCK_TYPE)).toBe(false);
    expect(reactPanel.editor.renderers.has(INTELLIGENT_UI_BLOCK_TYPE)).toBe(false);

    reactPanel.editor.destroy();
    await editor.destroy();
  });

  test("registers a leaf block and preserves source on slash conversion", async () => {
    const editor = await createTestCoreEditor({ registerWritingBlock: false });
    const reactPanel = createTestReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), intelligentUiExtension()],
    });
    const id = reactPanel.editor.blocks.insertBlock({
      type: "paragraph",
      content: SAMPLE_SOURCE,
    }).id;

    expect(editor.blockRegistry.get(INTELLIGENT_UI_BLOCK_TYPE)?.title).toBe("Intelligent UI");
    expect(reactPanel.editor.renderers.has(INTELLIGENT_UI_BLOCK_TYPE)).toBe(true);

    reactPanel.slashCommands.execute("type.intelligent-ui", { blockId: id });

    expect(editor.blocks.getBlockNode(id)).toMatchObject({
      id,
      type: INTELLIGENT_UI_BLOCK_TYPE,
      content: SAMPLE_SOURCE,
    });
    expect(editor.blocks.getBlock(id)?.children).toEqual([]);

    reactPanel.editor.destroy();
    await editor.destroy();
  });

  test("exports the program as plain text and a fenced markdown block", async () => {
    const editor = await createTestCoreEditor({ registerWritingBlock: false });
    const reactPanel = createTestReactEditor({
      editor,
      extensions: [intelligentUiExtension()],
    });
    const id = reactPanel.editor.blocks.insertBlock(
      createIntelligentUiBlockInput(SAMPLE_SOURCE),
    ).id;
    const block = editor.blocks.getBlock(id)!;

    expect(reactPanel.editor.clipboardFormats.format([block])).toEqual({
      plain: SAMPLE_SOURCE,
      markdown: `\`\`\`intelligent-ui\n${SAMPLE_SOURCE}\n\`\`\``,
      html: `<pre><code>${SAMPLE_SOURCE.replaceAll('"', "&quot;")}</code></pre>`,
    });

    reactPanel.editor.destroy();
    await editor.destroy();
  });
});
