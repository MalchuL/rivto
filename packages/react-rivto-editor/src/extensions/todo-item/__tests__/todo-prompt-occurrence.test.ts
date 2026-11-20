/** @jest-environment ./jest-browser-environment.mjs */
import { ChildrenPanel } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { ReactPanel } from "../../../panels/react-panel";
import { TodoPromptController } from "../todo-prompt-controller";

it("converts a candidate when a pointer enters another occurrence of the same block", async () => {
  const core = await createTestCoreEditor();
  core.blockRegistry.defineBlock({ type: "todo-item", title: "TODO" });
  const first = createTestReactEditor({ editor: core });
  const second = new ReactPanel(first.editor, new ChildrenPanel(core, {}));
  const block = first.blocks.insertBlock({ type: "paragraph", content: "TODO task" });
  const roots = [document.createElement("div"), document.createElement("div")];
  for (const root of roots) {
    root.dataset.rivtoBlockEditor = "true";
    root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>TODO task</span></div>`;
    document.body.append(root);
  }
  const release = new TodoPromptController(first.editor, new Map([["TODO", "todo"]])).setup();
  try {
    first.setRoot(roots[0]);
    second.setRoot(roots[1]);
    roots[0]
      .querySelector("[data-block-content]")!
      .dispatchEvent(new InputEvent("input", { bubbles: true }));
    await Promise.resolve();
    expect(roots[0].querySelector(".rivto-todo-prompt")).not.toBeNull();
    roots[1]
      .querySelector("[data-block-content]")!
      .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(first.blocks.getBlockNode(block.id)?.type).toBe("todo-item");
    expect(first.blocks.getBlockNode(block.id)?.content).toBe("task");
  } finally {
    release();
    second.destroy();
    first.editor.destroy();
    await core.destroy();
    roots.forEach((root) => root.remove());
  }
});
