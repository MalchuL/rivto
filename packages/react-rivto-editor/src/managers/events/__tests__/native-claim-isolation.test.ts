/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("keeps nested native claims separate without exposing either event", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const nested = new MouseEvent("click", { bubbles: true, cancelable: true });
  const outer = new MouseEvent("click", { bubbles: true, cancelable: true });
  const calls: string[] = [];
  let insideNested = false;
  panel.events.register({ id: "nested-claim", type: "click" }, (event) => {
    expect(event).not.toHaveProperty("raw");
    if (insideNested) {
      calls.push("nested");
      return true;
    }
    calls.push("outer");
    insideNested = true;
    root.dispatchEvent(nested);
    insideNested = false;
    return false;
  });
  panel.events.register({ id: "outer-later", type: "click" }, () => {
    calls.push("outer-later");
  });
  try {
    panel.setRoot(root);
    root.dispatchEvent(outer);
    expect(calls).toEqual(["outer", "nested", "outer-later"]);
    expect(nested.defaultPrevented).toBe(true);
    expect(outer.defaultPrevented).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
