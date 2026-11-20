/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("uses the routed keyboard snapshot when an earlier event handler changes native fields", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoSurface = "block";
  document.body.append(root);
  const seen: string[] = [];
  const raw = new KeyboardEvent("keydown", { key: "a", bubbles: true });
  panel.editor.events.register({ id: "change-key", type: "keydown" }, () => {
    Object.defineProperty(raw, "key", { value: "b" });
  });
  panel.editor.keyboard.register({ id: "capture-a", keys: "a" }, (event) => {
    seen.push(event.keyboard.key);
    return true;
  });
  try {
    panel.setRoot(root);
    root.dispatchEvent(raw);
    expect(seen).toEqual(["a"]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
