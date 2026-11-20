/** @jest-environment ./jest-browser-environment.mjs */
import { createCaretSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../../../test-utils";
import { registerCollapse } from "../register";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not focus an old root after collapse selection repair replaces its attachment", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  core.blocks.insertBlock({
    id: "parent",
    type: "paragraph",
    children: [{ id: "child", type: "paragraph", content: "Child" }],
  });
  const root = document.createElement("div");
  const replacement = document.createElement("div");
  root.tabIndex = 0;
  replacement.tabIndex = 0;
  replacement.textContent = "replacement";
  root.dataset.rivtoBlockEditor = "true";
  replacement.dataset.rivtoBlockEditor = "true";
  document.body.append(root, replacement);
  const release = registerCollapse(panel.editor);
  panel.setRoot(root);
  root.focus();
  panel.selection.set(createCaretSelection("child", 2));
  const focus = jestApi.spyOn(root, "focus");
  const originalSet = panel.selection.set.bind(panel.selection);
  const set = jestApi.spyOn(panel.selection, "set").mockImplementation((selection) => {
    originalSet(selection);
    panel.setRoot(null);
    panel.setRoot(replacement);
    const range = document.createRange();
    range.selectNodeContents(replacement);
    const browserSelection = document.getSelection()!;
    browserSelection.removeAllRanges();
    browserSelection.addRange(range);
  });
  try {
    core.blocks.updateBlock("parent", { listProps: { collapsed: true } });
    expect(core.selection.get()?.focusBlockId).toBe("parent");
    expect(panel.mountedRoot?.isForElement(replacement)).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    expect(document.getSelection()?.anchorNode).toBe(replacement);
  } finally {
    set.mockRestore();
    focus.mockRestore();
    release();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
    replacement.remove();
  }
});

it("clears browser selection and focuses the current root after repairing collapse", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  core.blocks.insertBlock({
    id: "parent",
    type: "paragraph",
    children: [{ id: "child", type: "paragraph", content: "Child" }],
  });
  const root = document.createElement("div");
  root.tabIndex = 0;
  root.dataset.rivtoBlockEditor = "true";
  root.textContent = "Child";
  document.body.append(root);
  const release = registerCollapse(panel.editor);
  try {
    panel.setRoot(root);
    root.focus();
    panel.selection.set(createCaretSelection("child", 2));
    const range = document.createRange();
    range.selectNodeContents(root);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    core.blocks.updateBlock("parent", { listProps: { collapsed: true } });
    expect(core.selection.get()?.focusBlockId).toBe("parent");
    expect(selection.rangeCount).toBe(0);
    expect(document.activeElement).toBe(root);
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
