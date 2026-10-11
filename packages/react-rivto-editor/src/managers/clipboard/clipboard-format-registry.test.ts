import { createTestReactEditor as createReactEditor } from "../../test-utils";

import { listShortcutsExtension } from "../../extensions/built-ins/built-ins";
import { createTestCoreEditor } from "../../test-utils";

describe("ClipboardFormatRegistry", () => {
  test("keeps descendants inside composed list formats", async () => {
    const editor = await createTestCoreEditor();
    const editorView = createReactEditor({ editor, extensions: [listShortcutsExtension()] });
    const id = editorView.runtime.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      listProps: { type: "checkbox" },
      children: [{ type: "paragraph", content: "Child" }],
    }).id;
    const block = editor.blocks.getBlock(id)!;

    expect(editorView.runtime.clipboardFormats.format([block])).toEqual({
      plain: "- [ ] Parent\n  Child",
      markdown: "- [ ] Parent\n  Child",
      html: '<ul><li><input type="checkbox" disabled><p>Parent</p><p>Child</p></li></ul>',
    });

    editorView.runtime.destroy();
    editor.destroy();
  });
});


test("rejects format and parser registrations after runtime cleanup", async () => {
  const editor = await createTestCoreEditor();
  const view = createReactEditor({ editor });
  const formats = view.runtime.clipboardFormats;
  view.runtime.destroy();
  expect(() => formats.registerFormatter({ id: "late", format: (_context, value) => value })).toThrow();
  expect(() => formats.registerParser({ id: "late", parse: () => undefined })).toThrow();
  editor.destroy();
});
