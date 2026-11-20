/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("renews a reused event when registration begins after window capture", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  document.body.append(root);
  const calls: string[] = [];
  const release = panel.events.register({ id: "first", type: "click" }, () => {
    calls.push("first");
  });
  const register = () => {
    panel.events.register({ id: "second", type: "click" }, () => {
      calls.push("second");
    });
  };
  try {
    panel.setRoot(root);
    const event = new MouseEvent("click", { bubbles: true });
    root.dispatchEvent(event);
    release();
    window.addEventListener("click", register, { capture: true, once: true });
    root.dispatchEvent(event);
    expect(calls).toEqual(["first", "second"]);
  } finally {
    window.removeEventListener("click", register, true);
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
