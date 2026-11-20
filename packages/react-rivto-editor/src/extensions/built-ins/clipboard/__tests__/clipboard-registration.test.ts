/** @jest-environment ./jest-browser-environment.mjs */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { clipboardExtension } from "../../built-ins";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not restore pasted selection after the input registration changes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({
    editor: core,
    extensions: [clipboardExtension({ defaultBlockType: "paragraph" })],
  });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  document.body.append(element);
  let callback: (() => void) | undefined;
  const schedule = jestApi
    .spyOn(panel.selection, "scheduleIfSelectionUnchanged")
    .mockImplementation((next) => {
      callback = next;
      return () => {};
    });
  const restore = jestApi.spyOn(panel.selection, "restoreDOM");
  const paste = jestApi.spyOn(panel.clipboard, "paste").mockReturnValue(undefined);
  try {
    panel.setRoot(element);
    const attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "text" } });
    element.dispatchEvent(event);
    expect(paste).toHaveBeenCalledTimes(1);
    expect(callback).toBeDefined();
    panel.setEnabled(false);
    panel.setEnabled(true);
    restore.mockClear();
    callback!();
    expect(restore).not.toHaveBeenCalled();
    attached.mockRestore();
  } finally {
    paste.mockRestore();
    restore.mockRestore();
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});

it("does not focus after a paste replaces its input registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({
    editor: core,
    extensions: [clipboardExtension({ defaultBlockType: "paragraph" })],
  });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  document.body.append(element);
  const selection = jestApi
    .spyOn(panel.selection, "get")
    .mockReturnValue(createStructuralSelection(["pasted"]));
  const focus = jestApi.spyOn(element, "focus");
  const paste = jestApi.spyOn(panel.clipboard, "paste").mockImplementation(() => {
    panel.setEnabled(false);
    panel.setEnabled(true);
    focus.mockClear();
    return undefined;
  });
  try {
    panel.setRoot(element);
    const attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "text" } });
    element.dispatchEvent(event);
    expect(paste).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
    attached.mockRestore();
  } finally {
    paste.mockRestore();
    focus.mockRestore();
    selection.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});
