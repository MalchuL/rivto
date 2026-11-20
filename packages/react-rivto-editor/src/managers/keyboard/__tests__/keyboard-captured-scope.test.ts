/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { KeyboardEditorEvent } from "../keyboard-editor-event";

it("retains block and content scope after the original markers change", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="one"><span data-block-content></span></div>';
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  let received: KeyboardEditorEvent | undefined;
  panel.editor.keyboard.register({ id: "captured-scope-test", keys: "k" }, (event) => {
    received = event;
    return true;
  });
  try {
    panel.setRoot(root);
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(received?.insideBlock).toBe(true);
    expect(received?.matches({ scope: "content" })).toBe(true);
    root.replaceChildren();
    expect(received?.matches({ scope: "block" })).toBe(true);
    expect(received?.matches({ scope: "content" })).toBe(true);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
