/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../../../test-utils";
import { registerListShortcuts } from "../register";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("does not convert deferred input after its registration ends while the Root remains attached", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "- " });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>- </span></div>`;
  document.body.append(root);
  registerListShortcuts(panel.editor);
  let attached: jest.SpiedFunction<() => boolean> | undefined;
  try {
    panel.setRoot(root);
    // Model the eventual shared Root: disabling input need not detach the occurrence.
    attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    root
      .querySelector("[data-block-content]")!
      .dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: " " }),
      );
    panel.setEnabled(false);
    panel.setEnabled(true);
    await Promise.resolve();
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("- ");
    expect(panel.blocks.getBlockNode(block.id)?.listProps.type).not.toBe("list");
  } finally {
    attached?.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

test("does not focus a converted block after its input registration ends", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "-" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>-</span></div>`;
  document.body.append(root);
  registerListShortcuts(panel.editor);
  let scheduled: (() => void) | undefined;
  const schedule = jestApi
    .spyOn(panel.selection, "scheduleIfSelectionUnchanged")
    .mockImplementation((callback) => {
      scheduled = callback;
      return () => {};
    });
  const focus = jestApi.spyOn(panel.selection, "focusBlock");
  let attached: jest.SpiedFunction<() => boolean> | undefined;
  try {
    panel.setRoot(root);
    attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    root.querySelector("[data-block-content]")!.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: " ",
      }),
    );
    expect(panel.blocks.getBlockNode(block.id)?.listProps.type).toBe("list");
    expect(scheduled).toBeDefined();
    panel.setEnabled(false);
    panel.setEnabled(true);
    scheduled?.();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    attached?.mockRestore();
    schedule.mockRestore();
    focus.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
