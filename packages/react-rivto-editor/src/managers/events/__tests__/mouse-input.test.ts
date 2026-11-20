/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { MouseInput } from "@chulane/rivto-root";

it("delivers normalized mouse data and live target queries without native objects", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const target = document.createElement("button");
  target.setAttribute("data-test-target", "first");
  root.append(target);
  let input: MouseInput | undefined;
  panel.events.register({ id: "mouse-input", type: "click" }, (event) => {
    input = event.mouseInput;
    expect(input?.target?.ancestorAttribute("[data-test-target]", "data-test-target")).toBe(
      "first",
    );
    target.setAttribute("data-test-target", "second");
    expect(input?.target?.ancestorAttribute("[data-test-target]", "data-test-target")).toBe(
      "second",
    );
  });
  try {
    panel.setRoot(root);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 42, detail: 2 }));
    expect(input?.clientX).toBe(42);
    expect(input?.detail).toBe(2);
    expect(input).not.toHaveProperty("raw");
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
