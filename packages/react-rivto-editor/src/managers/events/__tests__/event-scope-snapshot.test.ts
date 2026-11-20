/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { EditorEvent } from "../editor-event";

it("retains captured block and content scope after the target markers change", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="one"><span data-block-content></span></div>';
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  let received: EditorEvent<"surface", "click"> | undefined;
  panel.events.register({ id: "captured-scope-test", type: "click" }, (event) => {
    received = event;
  });
  try {
    panel.setRoot(root);
    content.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(received?.insideBlock).toBe(true);
    expect(received?.insideContent).toBe(true);
    expect(received?.blockId).toBe("one");
    root.replaceChildren();
    expect(received?.matches({ scope: "block" })).toBe(true);
    expect(received?.matches({ scope: "content" })).toBe(true);
    expect(received).not.toHaveProperty("blockElement");
    expect(received).not.toHaveProperty("contentElement");
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
