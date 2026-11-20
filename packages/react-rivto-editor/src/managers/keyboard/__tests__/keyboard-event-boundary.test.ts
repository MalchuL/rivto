/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { KeyboardEditorEvent } from "../keyboard-editor-event";

it("delivers keyboard input without exposing the browser root or native event", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  let received: KeyboardEditorEvent | undefined;
  panel.editor.keyboard.register({ id: "boundary-test", keys: "k" }, (event) => {
    received = event;
    return true;
  });
  try {
    panel.setRoot(root);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(received?.keyboard.key).toBe("k");
    expect(received?.inputRoot).toBe(panel.inputRoot);
    expect(received).not.toHaveProperty("root");
    expect(received).not.toHaveProperty("raw");
    expect(received).not.toHaveProperty("blockElement");
    expect(received).not.toHaveProperty("contentElement");
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
