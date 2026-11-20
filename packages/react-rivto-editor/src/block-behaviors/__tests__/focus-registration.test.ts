/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { createCaretSelection } from "@chulane/rivto";
import { registerBlockCreation } from "../../extensions/built-ins/page/block-creation/register";
import { focusCaret, scheduleBlockFocus } from "../utils/focus-ops";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not publish or apply caret focus after the input registration expires", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  document.body.append(element);
  try {
    panel.setRoot(element);
    const root = panel.inputRoot!;
    let current = true;
    const registration = { isCurrent: () => current };
    const set = jestApi.spyOn(panel.selection, "set");
    const focus = jestApi.spyOn(panel.selection, "focusBlock").mockReturnValue(false);
    scheduleBlockFocus(panel, block.id, 1, root, registration);
    current = false;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(root.isAttached()).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    focusCaret(panel, block.id, 1, root, registration);
    expect(set).not.toHaveBeenCalled();
  } finally {
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});

it("passes the keyboard registration to the block split behavior", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content contenteditable="true" tabindex="0">text</span></div>`;
  document.body.append(root);
  let received = false;
  registerBlockCreation(panel.editor);
  panel.editor.blockBehaviors.register(
    {
      isAvailable: () => true,
      /**
       * Checks that split behavior receives the input registration.
       *
       * @param context - Block and keyboard input captured for the split.
       * @returns Handled after inspecting the routing lifetime.
       */
      onSplit(context) {
        received = true;
        expect(context.inputRegistration?.isCurrent(context.inputRoot)).toBe(true);
        return "handled";
      },
    },
    100,
  );
  try {
    panel.setRoot(root);
    const content = root.querySelector<HTMLElement>("[data-block-content]")!;
    content.focus();
    panel.selection.set(createCaretSelection(block.id, 1));
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(received).toBe(true);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
