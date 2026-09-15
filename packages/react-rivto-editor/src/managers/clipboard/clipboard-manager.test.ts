import { createReactEditor } from "../../react-editor";
import { createTestCoreEditor } from "../../test-utils";
import { listShortcutsExtension } from "../../extensions/built-ins/built-ins";

describe("ClipboardManager", () => {
  test("keeps descendants inside composed list formats", () => {
    const editor = createTestCoreEditor();
    const reactEditor = createReactEditor({ editor, extensions: [listShortcutsExtension()] });
    const id = reactEditor.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      listProps: { type: "checkbox" },
      children: [{ type: "paragraph", content: "Child" }],
    });
    const block = editor.blocks.getBlock(id)!;

    expect(reactEditor.clipboard.format([block])).toEqual({
      plain: "- [ ] Parent\n  Child",
      markdown: "- [ ] Parent\n  Child",
      html: '<ul><li><input type="checkbox" disabled><p>Parent</p><p>Child</p></li></ul>',
    });

    reactEditor.destroy();
    editor.destroy();
  });

  test("uses the host writer with an octet-stream fallback", async () => {
    const editor = createTestCoreEditor();
    const writes: string[] = [];
    const reactEditor = createReactEditor({
      editor,
      extensions: [{
        id: "clipboard.writer",
        setup: (runtime) => runtime.clipboard.registerWriter({
          id: "host",
          supports: (type) => type === "application/octet-stream",
          write: (input) => { writes.push(input.mimeType); },
        }),
      }],
    });

    expect(reactEditor.clipboard.canWriteBinary("application/pdf")).toBe(true);
    await expect(reactEditor.clipboard.writeBinary({
      name: "report.pdf",
      mimeType: "application/pdf",
      data: new Blob(["pdf"], { type: "application/pdf" }),
    })).resolves.toBe(true);
    expect(writes).toEqual(["application/octet-stream"]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("does not claim an unavailable browser binary clipboard", () => {
    const editor = createTestCoreEditor();
    const reactEditor = createReactEditor({ editor });

    expect(reactEditor.clipboard.canWriteBinary("image/jpeg")).toBe(false);

    reactEditor.destroy();
    editor.destroy();
  });
});
