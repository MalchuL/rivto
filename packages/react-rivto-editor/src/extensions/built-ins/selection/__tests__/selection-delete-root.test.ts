/** @jest-environment ./jest-browser-environment.mjs */
import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { registerSelectionDeletion } from "../selection-deletion";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("deletes a structural selection only when the surface itself has focus", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "selected" });
  const root = document.createElement("div");
  const button = document.createElement("button");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  root.append(button);
  document.body.append(root);
  registerSelectionDeletion(panel.editor);
  try {
    panel.setRoot(root);
    button.focus();
    panel.selection.set(createStructuralSelection([block.id]));
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(core.blocks.hasBlock(block.id)).toBe(true);
    root.focus();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(core.blocks.hasBlock(block.id)).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not schedule caret restoration in a replacement created by deletion policy", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "selected" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  document.body.append(root);
  registerSelectionDeletion(panel.editor);
  panel.editor.blockBehaviors.register(
    {
      isAvailable: () => true,
      /**
       * Replaces the occurrence while the selected block's policy is running.
       *
       * @param context - Selected block and its panel.
       * @param ids - Complete structural selection.
       * @returns Handled after replacing the surface without deleting the block.
       */
      onStructuralDelete(context, ids) {
        panel.setRoot(null);
        panel.setRoot(root);
        return "handled";
      },
    },
    100,
  );
  const schedule = jestApi.spyOn(panel.selection, "scheduleIfSelectionUnchanged");
  try {
    panel.setRoot(root);
    root.focus();
    panel.selection.set(createStructuralSelection([block.id]));
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(core.blocks.hasBlock(block.id)).toBe(true);
    expect(schedule).not.toHaveBeenCalled();
  } finally {
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not delete a new occurrence from a stale keyboard delivery", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "selected" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  document.body.append(root);
  registerSelectionDeletion(panel.editor);
  panel.editor.keyboard.register({ id: "replace-root", keys: "Delete", priority: 100 }, () => {
    panel.setRoot(null);
    panel.setRoot(root);
    root.focus();
    panel.selection.set(createStructuralSelection([block.id]));
    return false;
  });
  try {
    panel.setRoot(root);
    root.focus();
    panel.selection.set(createStructuralSelection([block.id]));
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(core.blocks.hasBlock(block.id)).toBe(true);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
