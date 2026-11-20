/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { TodoPromptController } from "../todo-prompt-controller";
import { TODO_PROMPT_CLASS } from "../todo-item-classes";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not decorate input from a registration disabled and replaced before the microtask", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "TODO task" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>TODO task</span></div>`;
  document.body.append(root);
  const release = new TodoPromptController(panel.editor, new Map([["TODO", "todo"]])).setup();
  try {
    panel.setRoot(root);
    root
      .querySelector("[data-block-content]")!
      .dispatchEvent(new InputEvent("input", { bubbles: true }));
    panel.setEnabled(false);
    panel.setEnabled(true);
    await Promise.resolve();
    expect(root.querySelector(`.${TODO_PROMPT_CLASS}`)).toBeNull();
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("TODO task");
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("clears an old prompt decoration when the remounted occurrence receives nonmatching input", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "TODO task" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>TODO task</span></div>`;
  document.body.append(root);
  const release = new TodoPromptController(panel.editor, new Map([["TODO", "todo"]])).setup();
  try {
    panel.setRoot(root);
    const content = root.querySelector<HTMLElement>("[data-block-content]")!;
    content.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();
    const prompt = content.querySelector<HTMLElement>(`.${TODO_PROMPT_CLASS}`)!;
    expect(prompt).not.toBeNull();
    panel.setEnabled(false);
    panel.setEnabled(true);
    prompt.textContent = "other";
    content.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();
    expect(content.querySelector(`.${TODO_PROMPT_CLASS}`)).toBeNull();
    expect(content.textContent).toBe("other task");
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not decorate deferred input after its registration expires while the Root stays attached", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "TODO task" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>TODO task</span></div>`;
  document.body.append(root);
  const release = new TodoPromptController(panel.editor, new Map([["TODO", "todo"]])).setup();
  try {
    panel.setRoot(root);
    const attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    root
      .querySelector("[data-block-content]")!
      .dispatchEvent(new InputEvent("input", { bubbles: true }));
    panel.setEnabled(false);
    panel.setEnabled(true);
    await Promise.resolve();
    expect(root.querySelector(`.${TODO_PROMPT_CLASS}`)).toBeNull();
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("TODO task");
    attached.mockRestore();
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not convert a candidate from a replaced registration on a later pointer input", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "TODO task" });
  const other = panel.blocks.insertBlock({ type: "paragraph", content: "other" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>TODO task</span></div><div data-block-id="${other.id}"><span data-block-content>other</span></div>`;
  document.body.append(root);
  const release = new TodoPromptController(panel.editor, new Map([["TODO", "todo"]])).setup();
  const setType = jestApi.spyOn(panel.blocks, "setBlockType").mockImplementation(() => {});
  try {
    panel.setRoot(root);
    const attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    root
      .querySelector("[data-block-content]")!
      .dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();
    expect(root.querySelector(`.${TODO_PROMPT_CLASS}`)).not.toBeNull();
    panel.setEnabled(false);
    panel.setEnabled(true);
    root
      .querySelectorAll("[data-block-content]")[1]!
      .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(setType).not.toHaveBeenCalled();
    expect(panel.blocks.getBlockNode(block.id)?.type).toBe("paragraph");
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("TODO task");
    attached.mockRestore();
  } finally {
    setType.mockRestore();
    release();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
