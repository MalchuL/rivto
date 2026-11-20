/** @jest-environment ./jest-browser-environment.mjs */
import type { PointerInput } from "@chulane/rivto-root";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("delivers normalized lost-capture input to the receiving panel", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const handle = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.append(handle);
  document.body.append(root);
  let input: PointerInput | undefined;
  panel.events.register({ id: "lost-capture", type: "lostpointercapture" }, (event) => {
    input = event.pointerInput;
  });
  try {
    panel.setRoot(root);
    const native = new MouseEvent("lostpointercapture", { bubbles: true, clientX: 42 });
    Object.defineProperty(native, "pointerId", { value: 7 });
    handle.dispatchEvent(native);
    expect(input).toEqual(
      expect.objectContaining({ type: "lostpointercapture", pointerId: 7, clientX: 42 }),
    );
    expect(input).not.toBe(native);
    expect(input).not.toHaveProperty("raw");
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
