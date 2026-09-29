/**
 * Verifies embed reference parsing, live target rendering, and failure states.
 *
 * @module
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorView } from "../../../editor-view";
import { createReactEditor } from "../../../react-editor";
import { createTestCoreEditor as createRivtoEditor } from "../../../test-utils";
import { defaultWritingBlockExtension, pageSurfaceExtension } from "../built-ins";
import {
  EMBED_BLOCK_TYPE,
  embedBlockContent,
  embedBlockExtension,
  embedReferenceLabel,
  readEmbedTargetId,
} from "./embed-block";

const renderPage = (reactEditor: ReturnType<typeof createReactEditor>): string => (
  renderToStaticMarkup(createElement(EditorView, { reactEditor }))
);

describe("embed block", () => {
  test("parses the {{embed <id>}} content string", () => {
    expect(readEmbedTargetId("{{embed block-1}}")).toBe("block-1");
    expect(readEmbedTargetId("  {{embed block-1}}  ")).toBe("block-1");
    expect(readEmbedTargetId("{{embed }}")).toBeNull();
    expect(readEmbedTargetId("not an embed")).toBeNull();
    expect(embedBlockContent(" block-1 ")).toBe("{{embed block-1}}");
    expect(embedReferenceLabel("{{embed }}")).toBe("");
    expect(embedReferenceLabel("plain text")).toBe("plain text");
  });

  test("renders the target block inside a flush frame and keeps the reference string", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), pageSurfaceExtension(), embedBlockExtension()],
    });
    const source = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Shared text",
      children: [{ type: "paragraph", content: "Nested line" }],
    }).id;
    const embedId = editor.blocks.insertBlock({
      type: EMBED_BLOCK_TYPE,
      content: embedBlockContent(source),
    }).id;

    const html = renderPage(reactEditor);

    expect(editor.blocks.getBlockNode(embedId)?.content).toBe(`{{embed ${source}}}`);
    expect(html.match(/Shared text/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/Nested line/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.split(`id="block-children-${source}"`).length - 1).toBe(1);
    expect(html).toContain("rivto-embed-frame");
    expect(html).toContain("data-rivto-embed-mirror");
    expect(html).toContain("Edit embed reference");
    expect(html).toContain('data-slot-position="right"');

    editor.blocks.updateBlock(source, { content: "Updated live" });
    const updated = renderPage(reactEditor);
    expect(updated.match(/Updated live/g)?.length).toBeGreaterThanOrEqual(2);
    expect(editor.blocks.getBlockNode(embedId)?.content).toBe(`{{embed ${source}}}`);

    reactEditor.destroy();
    editor.destroy();
  });

  test("draws a missing-target alert naming the id", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), pageSurfaceExtension(), embedBlockExtension()],
    });
    editor.blocks.insertBlock({
      type: EMBED_BLOCK_TYPE,
      content: embedBlockContent("missing-block"),
    });

    const html = renderPage(reactEditor);

    expect(html).toContain('role="alert"');
    expect(html).toContain("Impossible to find block with id: missing-block");
    expect(html).toContain("rivto-embed-error");

    reactEditor.destroy();
    editor.destroy();
  });

  test("stops self-embeds and reference cycles", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), pageSurfaceExtension(), embedBlockExtension()],
    });
    const selfId = editor.blocks.insertBlock({ type: EMBED_BLOCK_TYPE, content: "pending" }).id;
    editor.blocks.updateBlock(selfId, { content: embedBlockContent(selfId) });
    const firstId = editor.blocks.insertBlock({ type: EMBED_BLOCK_TYPE, content: "pending" }).id;
    const secondId = editor.blocks.insertBlock({
      type: EMBED_BLOCK_TYPE,
      content: embedBlockContent(firstId),
    }).id;
    editor.blocks.updateBlock(firstId, { content: embedBlockContent(secondId) });

    const html = renderPage(reactEditor);

    expect(html).toContain(`Impossible to embed block with id: ${selfId}`);
    expect(html).toContain(`Impossible to embed block with id: ${firstId}`);
    expect(html).toContain(`Impossible to embed block with id: ${secondId}`);

    reactEditor.destroy();
    editor.destroy();
  });

  test("slash conversion keeps the block id and stores {{embed <id>}} in one undo", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), pageSurfaceExtension(), embedBlockExtension()],
    });
    const target = editor.blocks.insertBlock({ type: "paragraph", content: "Target" }).id;
    const host = editor.blocks.insertBlock({ type: "paragraph", content: target }).id;

    reactEditor.slashCommands.execute("block.embed.insert", { blockId: host });

    expect(host).not.toBe(target);
    expect(editor.blocks.getBlockNode(host)).toMatchObject({
      type: EMBED_BLOCK_TYPE,
      content: `{{embed ${target}}}`,
    });

    editor.history.undo();
    expect(editor.blocks.getBlockNode(host)).toMatchObject({
      type: "paragraph",
      content: target,
    });

    reactEditor.destroy();
    editor.destroy();
  });
});
