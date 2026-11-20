/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("uses current registrations when a reused event reaches a different listener group", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const calls: string[] = [];
  const release = panel.events.register({ id: "capture", type: "click", capture: true }, () => {
    calls.push("capture");
  });
  try {
    panel.setRoot(root);
    const event = new MouseEvent("click", { bubbles: true });
    root.dispatchEvent(event);
    release();
    panel.events.register({ id: "bubble", type: "click" }, () => {
      calls.push("bubble");
    });
    root.dispatchEvent(event);
    expect(calls).toEqual(["capture", "bubble"]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not retain a handled claim when a non-cancelable event is dispatched again", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  let count = 0;
  panel.events.register({ id: "claim", type: "click" }, () => {
    count += 1;
    return true;
  });
  try {
    panel.setRoot(root);
    const event = new MouseEvent("click", { bubbles: true, cancelable: false });
    root.dispatchEvent(event);
    root.dispatchEvent(event);
    expect(count).toBe(2);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
