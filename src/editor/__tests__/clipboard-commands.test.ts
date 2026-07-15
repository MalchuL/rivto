import { createRivtoEditor, RIVTO_CLIPBOARD_MIME } from "../index";

describe("clipboard commands", () => {
  it("serializes selected block subtrees with native data and internal links", () => {
    const editor = createRivtoEditor();
    const parent = editor.insertBlock({
      type: "paragraph",
      content: "Parent",
      props: { level: 1 },
      pluginData: { local: { pinned: true } },
      layout: { x: 10, y: 20, width: 300, height: 90, zIndex: 2 },
    });
    const child = editor.insertBlock({ type: "paragraph", content: "Child" }, parent);
    editor.indentBlock(child);
    editor.createLink({ id: "link-1", from: { blockId: parent }, to: { blockId: child } });
    editor.execute("selection.set", {
      selection: { type: "block", blockIds: [parent, child], anchorBlockId: parent, focusBlockId: child },
    });
    const data = new Map<string, string>();

    editor.execute("clipboard.copy", { clipboardData: { setData: (type: string, value: string) => data.set(type, value) } });

    const bundle = JSON.parse(data.get(RIVTO_CLIPBOARD_MIME)!) as {
      blocks: Array<{ id: string; props: Record<string, unknown>; pluginData: Record<string, unknown>; children: unknown[]; layout?: unknown }>;
      links: unknown[];
    };
    expect(bundle.blocks).toHaveLength(1);
    expect(bundle.blocks[0]?.id).toBe(parent);
    expect(bundle.blocks[0]?.props).toEqual({ level: 1 });
    expect(bundle.blocks[0]?.pluginData).toEqual({ local: { pinned: true } });
    expect(bundle.blocks[0]?.children).toHaveLength(1);
    expect(bundle.blocks[0]?.layout).toEqual({ x: 10, y: 20, width: 300, height: 90, zIndex: 2 });
    expect(bundle.links).toHaveLength(1);
    expect(data.get("text/plain")).toBe("Parent\nChild");
    editor.destroy();
  });

  it("pastes selected blocks as fresh blocks instead of plain text", () => {
    const source = createRivtoEditor();
    const target = createRivtoEditor();
    const copied = source.insertBlock({ type: "paragraph", content: "Copied" });
    const destination = target.insertBlock({ type: "paragraph", content: "Destination" });
    source.execute("selection.set", {
      selection: { type: "block", blockIds: [copied], anchorBlockId: copied, focusBlockId: copied },
    });
    const data = new Map<string, string>();
    source.execute("clipboard.copy", { clipboardData: { setData: (type: string, value: string) => data.set(type, value) } });
    target.execute("selection.set", {
      selection: { type: "block", blockIds: [destination], anchorBlockId: destination, focusBlockId: destination },
    });

    target.execute("clipboard.paste", { structured: data.get(RIVTO_CLIPBOARD_MIME) });

    expect(target.getBlock(destination)?.content).toBe("Destination");
    expect(target.getBlocks().map((block) => block.content)).toEqual(["Destination", "Copied"]);
    expect(target.getBlocks()[1]?.id).not.toBe(copied);
    source.destroy();
    target.destroy();
  });

  it("splits multiline plain paste into sibling blocks and moves the suffix", () => {
    const editor = createRivtoEditor();
    const id = editor.insertBlock({ type: "paragraph", content: "HelloWorld" });
    editor.execute("selection.set", {
      selection: { type: "text", anchor: { blockId: id, offset: 5 }, head: { blockId: id, offset: 5 } },
    });

    editor.execute("clipboard.paste", { text: " One\nTwo\nThree", defaultBlockType: "paragraph" });

    expect(editor.getBlocks().map((block) => block.content)).toEqual(["Hello One", "Two", "ThreeWorld"]);
    const last = editor.getBlocks()[2]!;
    expect(editor.selection.get()).toEqual({
      type: "text",
      anchor: { blockId: last.id, offset: "Three".length },
      head: { blockId: last.id, offset: "Three".length },
    });
    editor.destroy();
  });
});
