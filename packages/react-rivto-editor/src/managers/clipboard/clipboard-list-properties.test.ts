/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";

test("captures each editor's list translator once per HTML parse", async () => {
  const core = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: core });
  const second = createTestReactEditor({ editor: core });
  const formats = first.editor.clipboardFormats;
  const input = { html: "<ol><li>one</li><li>two</li></ol>", text: "" };
  const context = { surface: "page" as const, defaultBlockType: "paragraph" };
  try {
    formats.listProperties = () => {
      formats.listProperties = () => ({ type: "checkbox" });
      return { type: "list" };
    };
    expect(
      formats.parseContent(input, context)?.blocks?.map((block) => block.listProps?.type),
    ).toEqual(["list", "list"]);
    expect(formats.parseContent(input, context)?.blocks?.[0]?.listProps?.type).toBe("checkbox");
    expect(
      second.editor.clipboardFormats.parseContent(input, context)?.blocks?.[0]?.listProps?.type,
    ).toBe("numbered_list");
    formats.listProperties = undefined;
    expect(formats.parseContent(input, context)?.blocks?.[0]?.listProps).toBeUndefined();
  } finally {
    await first.editor.destroy();
    await second.editor.destroy();
    await core.destroy();
  }
});
