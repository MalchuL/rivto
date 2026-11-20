/** @jest-environment ./jest-browser-environment.mjs */
import { createStructuralSelection, RIVTO_CLIPBOARD_MIME } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { clipboardExtension } from "../../built-ins";

it("copies the focused occurrence when clipboard delivery is redirected to the document", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({
    editor: core,
    extensions: [clipboardExtension({ defaultBlockType: "paragraph" })],
  });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "copy me" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "block";
  root.tabIndex = 0;
  const child = document.createElement("button");
  root.append(child);
  document.body.append(root);
  const formats = new Map<string, string>();
  try {
    panel.setRoot(root);
    child.focus();
    panel.selection.set(createStructuralSelection([block.id]));
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (format: string) => formats.get(format) ?? "",
        setData: (format: string, value: string) => formats.set(format, value),
      },
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(formats.get(RIVTO_CLIPBOARD_MIME)).toContain("copy me");
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
