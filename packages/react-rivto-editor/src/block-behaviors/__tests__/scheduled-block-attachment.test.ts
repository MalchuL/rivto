/** @jest-environment ./jest-browser-environment.mjs */
import type { InputRoot } from "@chulane/rivto-root";
import { createCaretSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { focusCaret, scheduleBlockFocus } from "../utils/focus-ops";
import { registerBlockCreation } from "../../extensions/built-ins/page/block-creation/register";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not publish or schedule focus from a replaced registration on the same element", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  let original: Pick<InputRoot, "isAttached"> | undefined;
  panel.editor.events.register({ id: "capture-root", type: "click" }, (event) => {
    original = event.inputRoot;
  });
  const schedule = jestApi.spyOn(panel.selection, "scheduleIfSelectionUnchanged");
  const set = jestApi.spyOn(panel.selection, "set");
  try {
    panel.setRoot(root);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(original?.isAttached()).toBe(true);
    panel.setRoot(null);
    panel.setRoot(root);
    expect(original?.isAttached()).toBe(false);
    schedule.mockClear();
    set.mockClear();
    scheduleBlockFocus(panel, block.id, 1, original);
    focusCaret(panel, block.id, 1, original);
    expect(schedule).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  } finally {
    schedule.mockRestore();
    set.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("passes the original keyboard attachment through a split behavior during remount", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content contenteditable="true" tabindex="0">text</span></div>`;
  document.body.append(root);
  let invoked = false;
  registerBlockCreation(panel.editor);
  panel.editor.blockBehaviors.register(
    {
      isAvailable: () => true,
      /**
       * Remounts the same surface before the behavior requests deferred focus.
       *
       * @param context - Block snapshot and original keyboard attachment.
       * @param target - Captured keyboard selection target.
       * @returns Handled after attempting the stale focus request.
       */
      onSplit(context, target) {
        expect(context).not.toHaveProperty("root");
        invoked = true;
        expect(context.inputRoot?.isAttached()).toBe(true);
        panel.setRoot(null);
        panel.setRoot(root);
        scheduleBlockFocus(panel, block.id, 1, context.inputRoot);
        return "handled";
      },
    },
    100,
  );
  const schedule = jestApi.spyOn(panel.selection, "scheduleIfSelectionUnchanged");
  try {
    panel.setRoot(root);
    const content = root.querySelector<HTMLElement>("[data-block-content]")!;
    content.focus();
    panel.selection.set(createCaretSelection(block.id, 1));
    schedule.mockClear();
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(invoked).toBe(true);
    expect(schedule).not.toHaveBeenCalled();
  } finally {
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
