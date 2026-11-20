/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { KeyboardPanel } from "../types";

const excludesRoot: "getRoot" extends keyof KeyboardPanel ? false : true = true;
const excludesLifecycle: "registerCleanup" extends keyof KeyboardPanel ? false : true = true;
const excludesEvents: "events" extends keyof KeyboardPanel ? false : true = true;

it("passes the existing panel through the narrowed keyboard contract", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  let received: KeyboardPanel | undefined;
  panel.editor.keyboard.register({ id: "panel-contract-test", keys: "k" }, (event) => {
    received = event.reactPanel;
    return true;
  });
  try {
    panel.setRoot(root);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(received).toBe(panel);
    expect([excludesRoot, excludesLifecycle, excludesEvents]).toEqual([true, true, true]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
