import { createTestReactEditor as createReactEditor } from "../../test-utils";

import { createTestCoreEditor } from "../../test-utils";
import { listShortcutsExtension } from "../../extensions/built-ins/built-ins";

describe("ClipboardManager", () => {
  test("keeps descendants inside composed list formats", async () => {
    const editor = await createTestCoreEditor();
    const editorView = createReactEditor({ editor, extensions: [listShortcutsExtension()] });
    const id = editorView.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      listProps: { type: "checkbox" },
      children: [{ type: "paragraph", content: "Child" }],
    }).id;
    const block = editor.blocks.getBlock(id)!;

    expect(editorView.clipboard.format([block])).toEqual({
      plain: "- [ ] Parent\n  Child",
      markdown: "- [ ] Parent\n  Child",
      html: '<ul><li><input type="checkbox" disabled><p>Parent</p><p>Child</p></li></ul>',
    });

    editorView.destroy();
    editor.destroy();
  });
});
