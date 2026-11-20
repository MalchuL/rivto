/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("routes normalized context menu input to its panel and preserves cancellation", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const target = document.createElement("button");
  target.dataset.control = "true";
  root.append(target);
  const received: number[] = [];
  const release = panel.events.register({ id: "context-input", type: "contextmenu" }, (event) => {
    const input = event.mouseInput;
    if (input?.target?.hasAncestor("[data-control]")) {
      received.push(input.button);
      input.preventDefault();
    }
  });
  try {
    panel.setRoot(root);
    const native = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    target.dispatchEvent(native);
    expect(received).toEqual([2]);
    expect(native.defaultPrevented).toBe(true);
    release();
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2 }));
    expect(received).toEqual([2]);
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
  }
});
