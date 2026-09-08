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
});
