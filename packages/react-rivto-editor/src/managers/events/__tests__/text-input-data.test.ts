/** @jest-environment ./jest-browser-environment.mjs */
import type { TextInputData } from "@chulane/rivto-root";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("captures text input fields without retaining the native event", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "text-input";
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "block";
  document.body.append(root);
  const values: Array<TextInputData | undefined> = [];
  panel.editor.events.register({ id: "text-before", type: "beforeinput" }, (event) => {
    values.push(event.textInput);
  });
  panel.editor.events.register({ id: "text-input", type: "input" }, (event) => {
    values.push(event.textInput);
  });
  try {
    panel.setRoot(root);
    const input = new InputEvent("beforeinput", {
      bubbles: true,
      inputType: "insertText",
      data: "/",
      isComposing: true,
    });
    root.dispatchEvent(input);
    Object.defineProperty(input, "data", { value: "changed" });
    root.dispatchEvent(new Event("input", { bubbles: true }));
    expect(values).toEqual([
      { inputType: "insertText", data: "/", isComposing: true },
      { inputType: "", data: null, isComposing: false },
    ]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
