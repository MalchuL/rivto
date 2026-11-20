/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { TodoPromptController } from "../todo-prompt-controller";
import { TODO_PROMPT_CLASS } from "../todo-item-classes";

it("does not decorate a host moved to a nested occurrence before the input microtask", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "TODO task" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoPanel = "";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>TODO task</span></div><div data-rivto-panel><div data-block-id="${block.id}"></div></div>`;
  document.body.append(root);
  const release = new TodoPromptController(panel.editor, new Map([["TODO", "todo"]])).setup();
  try {
    panel.setRoot(root);
    const content = root.querySelector<HTMLElement>("[data-block-content]")!;
    const nested = root.querySelectorAll<HTMLElement>("[data-block-id]")[1]!;
    content.dispatchEvent(new InputEvent("input", { bubbles: true }));
    nested.append(content);
    await Promise.resolve();
    expect(content.querySelector(`.${TODO_PROMPT_CLASS}`)).toBeNull();
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("TODO task");
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not convert or clear a candidate moved to a nested occurrence", async () => {
  const core = await createTestCoreEditor();
  core.blockRegistry.defineBlock({ type: "todo-item", title: "TODO" });
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "TODO task" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoPanel = "";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>TODO task</span></div><div data-rivto-panel><div data-block-id="${block.id}"></div></div>`;
  document.body.append(root);
  const release = new TodoPromptController(panel.editor, new Map([["TODO", "todo"]])).setup();
  try {
    panel.setRoot(root);
    const content = root.querySelector<HTMLElement>("[data-block-content]")!;
    content.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();
    expect(content.querySelector(`.${TODO_PROMPT_CLASS}`)).not.toBeNull();
    root.querySelectorAll<HTMLElement>("[data-block-id]")[1]!.append(content);
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(panel.blocks.getBlockNode(block.id)?.type).toBe("paragraph");
    expect(content.querySelector(`.${TODO_PROMPT_CLASS}`)).not.toBeNull();
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
