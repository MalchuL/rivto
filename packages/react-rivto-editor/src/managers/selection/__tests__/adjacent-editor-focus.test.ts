/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("focuses the adjacent occurrence through its own selection capability", async () => {
  const firstCore = await createTestCoreEditor();
  const secondCore = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: firstCore });
  const second = createTestReactEditor({ editor: secondCore });
  const roots = [document.createElement("div"), document.createElement("div")];
  for (const root of roots) {
    root.dataset.rivtoBlockEditor = "";
    root.dataset.rivtoPageEditorRoot = "";
    root.innerHTML = '<div data-block-id="target"><span data-block-content>Text</span></div>';
    document.body.append(root);
  }
  const focus = jestApi
    .spyOn(second.page.browserSelection, "focusBlock")
    .mockReturnValue("focus-requested");
  try {
    first.setRoot(roots[0]!);
    second.setRoot(roots[1]!);
    expect(first.selection.focusAdjacentEditor("down")).toBe(true);
    expect(focus).toHaveBeenCalledWith({ blockId: "target", offset: 0 });
    second.pageNavigation.setRoot(null);
    expect(first.selection.focusAdjacentEditor("down")).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1);
  } finally {
    focus.mockRestore();
    first.editor.destroy();
    second.editor.destroy();
    await firstCore.destroy();
    await secondCore.destroy();
    roots.forEach((root) => root.remove());
  }
});

it("does not focus a replacement attachment on the same adjacent surface", async () => {
  const firstCore = await createTestCoreEditor();
  const secondCore = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: firstCore });
  const second = createTestReactEditor({ editor: secondCore });
  const roots = [document.createElement("div"), document.createElement("div")];
  for (const root of roots) {
    root.dataset.rivtoBlockEditor = "";
    root.dataset.rivtoPageEditorRoot = "";
    root.innerHTML = '<div data-block-id="target"><span data-block-content>Text</span></div>';
    document.body.append(root);
  }
  const focus = jestApi.spyOn(second.page.browserSelection, "focusBlock");
  try {
    first.setRoot(roots[0]!);
    second.setRoot(roots[1]!);
    jestApi.spyOn(second.pageNavigation, "mountFirstOrLastBlock").mockImplementation(() => {
      second.setRoot(null);
      second.setRoot(roots[1]!);
    });
    expect(first.selection.focusAdjacentEditor("down")).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    first.editor.destroy();
    second.editor.destroy();
    await firstCore.destroy();
    await secondCore.destroy();
    roots.forEach((root) => root.remove());
  }
});

it("does not focus the adjacent editor when the source is disabled during mounting", async () => {
  const firstCore = await createTestCoreEditor();
  const secondCore = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: firstCore });
  const second = createTestReactEditor({ editor: secondCore });
  const roots = [document.createElement("div"), document.createElement("div")];
  for (const root of roots) {
    root.dataset.rivtoBlockEditor = "";
    root.dataset.rivtoPageEditorRoot = "";
    root.innerHTML = '<div data-block-id="target"><span data-block-content>Text</span></div>';
    document.body.append(root);
  }
  const focus = jestApi.spyOn(second.page.browserSelection, "focusBlock");
  try {
    first.setRoot(roots[0]!);
    second.setRoot(roots[1]!);
    jestApi.spyOn(second.pageNavigation, "mountFirstOrLastBlock").mockImplementation(() => {
      first.setEnabled(false);
    });
    expect(first.selection.focusAdjacentEditor("down")).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    first.editor.destroy();
    second.editor.destroy();
    await firstCore.destroy();
    await secondCore.destroy();
    roots.forEach((root) => root.remove());
  }
});

it("does not skip an unregistered adjacent page", async () => {
  const firstCore = await createTestCoreEditor();
  const lastCore = await createTestCoreEditor();
  const first = createTestReactEditor({ editor: firstCore });
  const last = createTestReactEditor({ editor: lastCore });
  const roots = Array.from({ length: 3 }, () => document.createElement("div"));
  for (const root of roots) {
    root.dataset.rivtoBlockEditor = "";
    root.dataset.rivtoPageEditorRoot = "";
    root.innerHTML = '<div data-block-id="target"><span data-block-content>Text</span></div>';
    document.body.append(root);
  }
  const focus = jestApi.spyOn(last.page.browserSelection, "focusBlock");
  try {
    first.setRoot(roots[0]!);
    last.setRoot(roots[2]!);
    expect(first.selection.focusAdjacentEditor("down")).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    first.editor.destroy();
    last.editor.destroy();
    await firstCore.destroy();
    await lastCore.destroy();
    roots.forEach((root) => root.remove());
  }
});
