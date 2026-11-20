/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("checks the keyboard target's current content and block markers", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "keyboard-target";
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "block";
  root.innerHTML =
    '<div data-block-id="block"><div data-block-content><span>text</span></div></div>';
  document.body.append(root);
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  const block = root.querySelector<HTMLElement>("[data-block-id]")!;
  const target = content.firstElementChild!;
  const seen: boolean[] = [];
  const rootTargets: boolean[] = [];
  panel.editor.keyboard.register({ id: "test-content-target", keys: ["Escape"] }, (event) => {
    rootTargets.push(event.isRootTarget());
    seen.push(event.isBlockContentTarget());
    content.removeAttribute("data-block-content");
    seen.push(event.isBlockContentTarget());
    content.setAttribute("data-block-content", "");
    block.removeAttribute("data-block-id");
    seen.push(event.isBlockContentTarget());
  });
  try {
    panel.setRoot(root);
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(seen).toEqual([true, false, false]);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(rootTargets).toEqual([false, true]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
