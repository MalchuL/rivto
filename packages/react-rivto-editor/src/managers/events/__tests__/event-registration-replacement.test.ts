/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it.each([true, false])(
  "preserves a dispatch snapshot when its last listener is replaced, connected=%s",
  async (connected) => {
    const core = await createTestCoreEditor();
    const panel = createTestReactEditor({ editor: core });
    const root = document.createElement("div");
    if (connected) {
      document.body.append(root);
    }
    const calls: string[] = [];
    let release = () => {};
    release = panel.events.register({ id: "capture", type: "click", capture: true }, () => {
      calls.push("capture");
      release();
      panel.events.register({ id: "bubble", type: "click" }, () => {
        calls.push("bubble");
      });
    });
    try {
      panel.setRoot(root);
      const event = new MouseEvent("click", { bubbles: true });
      root.dispatchEvent(event);
      expect(calls).toEqual(["capture"]);
      root.dispatchEvent(event);
      expect(calls).toEqual(["capture", "bubble"]);
    } finally {
      panel.editor.destroy();
      await core.destroy();
      root.remove();
    }
  },
);
