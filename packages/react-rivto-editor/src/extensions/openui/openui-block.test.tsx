/**
 * Verifies the OpenUI extension stays opt-in, keeps its source through slash
 * conversion, and exports that source on the clipboard.
 *
 * Drawing is covered by the demo. Jest maps the OpenUI packages to local
 * stand-ins so this file can load the extension without the browser renderer.
 *
 * @module
 */
import { createReactEditor } from "../../react-editor";
import { createTestCoreEditor as createRivtoEditor } from "../../test-utils";
import { defaultWritingBlockExtension, standardPreset } from "../built-ins/built-ins";
import {
  OPENUI_BLOCK_TYPE,
  createOpenUiBlockInput,
  openuiExtension,
} from "./openui-block";

const SAMPLE_SOURCE = [
  "root = Stack([title])",
  "title = TextContent(\"Hello\", \"large-heavy\")",
].join("\n");

describe("openuiExtension", () => {
  test("is not installed by the standard preset", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor, extensions: [standardPreset()] });

    expect(editor.blockRegistry.has(OPENUI_BLOCK_TYPE)).toBe(false);
    expect(reactEditor.renderers.has(OPENUI_BLOCK_TYPE)).toBe(false);

    reactEditor.destroy();
    editor.destroy();
  });

  test("registers a leaf OpenUI block and preserves source on slash conversion", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), openuiExtension()],
    });
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      content: SAMPLE_SOURCE,
    }).id;

    expect(editor.blockRegistry.get(OPENUI_BLOCK_TYPE)?.title).toBe("OpenUI");
    expect(reactEditor.renderers.has(OPENUI_BLOCK_TYPE)).toBe(true);

    reactEditor.slashCommands.execute("type.openui", { blockId: id });

    expect(editor.blocks.getBlockNode(id)).toMatchObject({
      id,
      type: OPENUI_BLOCK_TYPE,
      content: SAMPLE_SOURCE,
    });
    expect(editor.blocks.getBlock(id)?.children).toEqual([]);

    reactEditor.destroy();
    editor.destroy();
  });

  test("exports the OpenUI program as plain text and a fenced markdown block", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor, extensions: [openuiExtension()] });
    const id = editor.blocks.insertBlock(createOpenUiBlockInput(SAMPLE_SOURCE)).id;
    const block = editor.blocks.getBlock(id)!;

    expect(reactEditor.clipboard.format([block])).toEqual({
      plain: SAMPLE_SOURCE,
      markdown: `\`\`\`openui\n${SAMPLE_SOURCE}\n\`\`\``,
      html: `<pre><code>${SAMPLE_SOURCE.replaceAll("\"", "&quot;")}</code></pre>`,
    });

    reactEditor.destroy();
    editor.destroy();
  });
});
