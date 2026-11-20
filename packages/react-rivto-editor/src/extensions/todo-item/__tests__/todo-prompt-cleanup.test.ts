/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { TodoPromptController } from "../todo-prompt-controller";
import { TODO_PROMPT_CLASS } from "../todo-item-classes";

it("does not rewrite an old host after its occurrence is replaced", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "TODO task" });
  const first = document.createElement("div");
  const replacement = document.createElement("div");
  for (const root of [first, replacement]) {
    root.dataset.rivtoBlockEditor = "true";
    root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>TODO task</span></div>`;
    document.body.append(root);
  }
  const release = new TodoPromptController(panel.editor, new Map([["TODO", "todo"]])).setup();
  try {
    panel.setRoot(first);
    first
      .querySelector("[data-block-content]")!
      .dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();
    expect(first.querySelector(`.${TODO_PROMPT_CLASS}`)).not.toBeNull();
    panel.setRoot(replacement);
    release();
    expect(first.querySelector(`.${TODO_PROMPT_CLASS}`)).not.toBeNull();
    expect(replacement.querySelector(`.${TODO_PROMPT_CLASS}`)).toBeNull();
  } finally {
    panel.editor.destroy();
    await core.destroy();
    first.remove();
    replacement.remove();
  }
});

it("clears decoration after revalidating the same host in a new registration", async () => {
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
    await Promise.resolve();
    expect(root.querySelector(`.${TODO_PROMPT_CLASS}`)).not.toBeNull();
    panel.setEnabled(false);
    panel.setEnabled(true);
    release();
    expect(root.querySelector(`.${TODO_PROMPT_CLASS}`)).toBeNull();
    expect(root.querySelector("[data-block-content]")?.textContent).toBe("TODO task");
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not clear a host moved outside the still-active occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "TODO task" });
  const root = document.createElement("div");
  const other = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>TODO task</span></div>`;
  document.body.append(root, other);
  const release = new TodoPromptController(panel.editor, new Map([["TODO", "todo"]])).setup();
  try {
    panel.setRoot(root);
    const content = root.querySelector<HTMLElement>("[data-block-content]")!;
    content.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();
    expect(content.querySelector(`.${TODO_PROMPT_CLASS}`)).not.toBeNull();
    other.append(content);
    release();
    expect(content.querySelector(`.${TODO_PROMPT_CLASS}`)).not.toBeNull();
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
    other.remove();
  }
});
