/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("edits and focuses only a structural predecessor in the same card", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "";
  root.innerHTML = `
    <div data-edgeless-root="one" tabindex="-1">
      <div data-block-id="structural"><div data-block-id="child"><span data-block-content></span></div></div>
      <div data-block-id="current"><span data-block-content></span></div>
      <div data-block-id="editable"><span data-block-content></span></div>
    </div>
    <div data-edgeless-root="two"><div data-block-id="outside"></div></div>`;
  const card = root.querySelector<HTMLElement>('[data-edgeless-root="one"]')!;
  const focus = jestApi.spyOn(card, "focus");
  const edit = jestApi.fn();
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    expect(
      panel.selection.runWithStructuralPredecessorFocus("current", "outside", edit, inputRoot),
    ).toBe(false);
    expect(
      panel.selection.runWithStructuralPredecessorFocus("current", "editable", edit, inputRoot),
    ).toBe(false);
    expect(edit).not.toHaveBeenCalled();
    expect(
      panel.selection.runWithStructuralPredecessorFocus("current", "structural", edit, inputRoot),
    ).toBe(true);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  } finally {
    focus.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not focus a replaced occurrence after the edit", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="structural"></div><div data-block-id="current"></div>';
  const focus = jestApi.spyOn(root, "focus");
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    const edited = panel.selection.runWithStructuralPredecessorFocus(
      "current",
      "structural",
      () => {
        panel.setRoot(null);
        panel.setRoot(root);
      },
      inputRoot,
    );
    expect(edited).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    expect(
      panel.selection.runWithStructuralPredecessorFocus(
        "current",
        "structural",
        () => {},
        inputRoot,
      ),
    ).toBe(false);
  } finally {
    focus.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not edit if the occurrence is removed during the predecessor lookup", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="structural"></div><div data-block-id="current"></div>';
  const edit = jestApi.fn();
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    jestApi.spyOn(panel.mountedRoot!, "captureTextOwnerScope").mockReturnValue({
      hasContentlessOwner: () => {
        panel.setRoot(null);
        return true;
      },
      focus: jestApi.fn(),
    });
    expect(
      panel.selection.runWithStructuralPredecessorFocus("current", "structural", edit, inputRoot),
    ).toBe(false);
    expect(edit).not.toHaveBeenCalled();
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not edit when the input check detaches the mounted Root", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="structural"></div><div data-block-id="current"></div>';
  const edit = jestApi.fn();
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    const occurrence = panel.mountedRoot!;
    jestApi.spyOn(inputRoot, "isAttached").mockImplementationOnce(() => {
      occurrence.detach();
      return true;
    });
    expect(
      panel.selection.runWithStructuralPredecessorFocus("current", "structural", edit, inputRoot),
    ).toBe(false);
    expect(edit).not.toHaveBeenCalled();
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not focus after the keyboard registration expires during the edit", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="structural"></div><div data-block-id="current"></div>';
  const focus = jestApi.spyOn(root, "focus");
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    let current = true;
    const registration = { isCurrent: () => current };
    expect(
      panel.selection.runWithStructuralPredecessorFocus(
        "current",
        "structural",
        () => {
          current = false;
        },
        inputRoot,
        registration,
      ),
    ).toBe(true);
    expect(inputRoot.isAttached()).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    expect(
      panel.selection.runWithStructuralPredecessorFocus(
        "current",
        "structural",
        jestApi.fn(),
        inputRoot,
        registration,
      ),
    ).toBe(false);
  } finally {
    focus.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});
