/** @jest-environment ./jest-browser-environment.mjs */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { clipboardExtension } from "../../built-ins";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not focus a replacement occurrence after structural paste", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({
    editor: core,
    extensions: [clipboardExtension({ defaultBlockType: "paragraph" })],
  });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "block";
  root.tabIndex = 0;
  document.body.append(root);
  const selection = jestApi
    .spyOn(panel.selection, "get")
    .mockReturnValue(createStructuralSelection(["pasted"]));
  const focus = jestApi.spyOn(root, "focus");
  const paste = jestApi.spyOn(panel.clipboard, "paste").mockImplementation(() => {
    panel.setRoot(null);
    panel.setRoot(root);
    focus.mockClear();
    return undefined;
  });
  try {
    panel.setRoot(root);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: (format: string) => (format === "text/plain" ? "pasted" : "") },
    });
    root.dispatchEvent(event);
    expect(paste).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    paste.mockRestore();
    selection.mockRestore();
    focus.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
