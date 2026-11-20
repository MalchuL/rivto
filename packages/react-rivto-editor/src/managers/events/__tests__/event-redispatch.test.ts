/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("starts a fresh registration snapshot when a browser event object is dispatched again", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const calls: string[] = [];
  let installed = false;
  panel.events.register({ id: "capture", type: "click", capture: true }, () => {
    calls.push("capture");
    if (!installed) {
      installed = true;
      panel.events.register({ id: "later", type: "click" }, () => {
        calls.push("later");
      });
    }
  });
  panel.events.register({ id: "bubble", type: "click" }, () => {
    calls.push("bubble");
  });
  try {
    panel.setRoot(root);
    const click = new MouseEvent("click", { bubbles: true });
    root.dispatchEvent(click);
    expect(calls).toEqual(["capture", "bubble"]);
    root.dispatchEvent(click);
    expect(calls).toEqual(["capture", "bubble", "capture", "bubble", "later"]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
