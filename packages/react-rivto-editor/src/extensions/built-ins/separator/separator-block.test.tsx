import { createCaretSelection } from "@chulane/rivto";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createTestReactEditor as createReactEditor,
  createTestCoreEditor as createDocumentEditor,
} from "../../../test-utils";

import {
  collapseExtension,
  defaultWritingBlockExtension,
  listShortcutsExtension,
} from "../built-ins";
import { blockHandleExtension } from "../block-handle/extension";
import { SEPARATOR_BLOCK_TYPE, SeparatorBlock, separatorBlockExtension } from "./separator-block";

describe("separator block extension", () => {
  test("registers a contentless accessible separator renderer", async () => {
    const editor = await createDocumentEditor({ registerWritingBlock: false });
    const reactPanel = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
    });

    expect(editor.blockRegistry.has(SEPARATOR_BLOCK_TYPE)).toBe(true);
    expect(reactPanel.editor.blockTypes.separatesBlockElements(SEPARATOR_BLOCK_TYPE)).toBe(true);
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('role="separator"');
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('data-separator-block="true"');
    expect(renderToStaticMarkup(<SeparatorBlock />)).toContain('data-block-selection-anchor=""');

    reactPanel.editor.destroy();
    editor.destroy();
  });

  test("inserts a separator after content and focuses a new writing block", async () => {
    const editor = await createDocumentEditor({ registerWritingBlock: false });
    const reactPanel = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
    });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "Keep me" }).id;
    reactPanel.selection.set(createCaretSelection(first, 0));

    reactPanel.slashCommands.execute("block.separator.insert", { blockId: first });

    const roots = editor.blocks.getRootIds();
    expect(roots).toHaveLength(3);
    expect(editor.blocks.getBlockNode(roots[0]!)?.content).toBe("Keep me");
    expect(editor.blocks.getBlockNode(roots[1]!)?.type).toBe(SEPARATOR_BLOCK_TYPE);
    expect(editor.blocks.getBlockNode(roots[2]!)?.type).toBe("paragraph");
    expect(editor.blocks.getBlockNode(roots[2]!)?.content).toBe("");

    reactPanel.editor.destroy();
    editor.destroy();
  });

  test("converts an empty leaf into a separator before inserting writing", async () => {
    const editor = await createDocumentEditor({ registerWritingBlock: false });
    const reactPanel = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
    });
    const empty = editor.blocks.insertBlock({ type: "paragraph", content: "" }).id;
    reactPanel.selection.set(createCaretSelection(empty, 0));

    reactPanel.slashCommands.execute("block.separator.insert", { blockId: empty });

    expect(editor.blocks.getBlockNode(empty)?.type).toBe(SEPARATOR_BLOCK_TYPE);
    const roots = editor.blocks.getRootIds();
    expect(roots[0]).toBe(empty);
    expect(editor.blocks.getBlockNode(roots[1]!)?.type).toBe("paragraph");

    reactPanel.editor.destroy();
    editor.destroy();
  });

  test("uses registered list-property defaults when creating or converting separators", async () => {
    const editor = await createDocumentEditor({ registerWritingBlock: false });
    const reactPanel = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), separatorBlockExtension()],
    });
    const release = reactPanel.editor.blockListProps.register({
      id: "custom-list",
      defaults: { type: "custom", checked: false },
      isValid: (candidate) => candidate.type === "custom",
    });
    try {
      const filled = editor.blocks.insertBlock({ type: "paragraph", content: "Keep" }).id;
      reactPanel.slashCommands.execute("block.separator.insert", { blockId: filled });
      const created = editor.blocks.getRootIds()[1]!;
      expect(editor.blocks.getBlockNode(created)?.listProps.type).toBe("custom");
      const empty = editor.blocks.insertBlock({ type: "paragraph", content: "" }).id;
      reactPanel.slashCommands.execute("block.separator.insert", { blockId: empty });
      expect(editor.blocks.getBlockNode(empty)?.type).toBe(SEPARATOR_BLOCK_TYPE);
      expect(editor.blocks.getBlockNode(empty)?.listProps.type).toBe("custom");
    } finally {
      release();
      reactPanel.editor.destroy();
      editor.destroy();
    }
  });

  test("resets list and collapse state without clearing unrelated background color", async () => {
    const editor = await createDocumentEditor({ registerWritingBlock: false });
    const panel = createReactEditor({
      editor,
      extensions: [
        defaultWritingBlockExtension(),
        separatorBlockExtension(),
        listShortcutsExtension(),
        collapseExtension(),
        blockHandleExtension(),
      ],
    });
    try {
      const empty = editor.blocks.insertBlock({
        type: "paragraph",
        content: "",
        listProps: { type: "checkbox", checked: true, collapsed: true, backgroundColor: "red" },
      }).id;
      panel.slashCommands.execute("block.separator.insert", { blockId: empty });
      expect(editor.blocks.getBlockNode(empty)?.listProps).toMatchObject({
        type: "list",
        checked: false,
        collapsed: false,
        backgroundColor: "red",
      });
    } finally {
      await panel.editor.destroy();
      await editor.destroy();
    }
  });
});
