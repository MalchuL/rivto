/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("checks live focus containment against the captured block without exposing nodes", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML =
    '<div data-block-id="block"><span data-block-content>text</span><button>inside</button></div><button>outside</button>';
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  const inside = root.querySelector<HTMLElement>('[data-block-id="block"] button')!;
  const outside = root.querySelector<HTMLElement>(":scope > button")!;
  const results: Array<boolean | undefined> = [];
  panel.editor.events.register({ id: "focus-target", type: "focusout" }, (event) => {
    results.push(event.isFocusWithinBlock?.());
  });
  try {
    panel.setRoot(root);
    content.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: inside }));
    content.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }));
    content.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    expect(results).toEqual([true, false, false]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
