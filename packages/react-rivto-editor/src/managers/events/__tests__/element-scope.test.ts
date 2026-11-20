/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";

it("captures block scope for an element but not its text-node target", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id=""><span data-block-content>text</span></div>';
  const content = root.querySelector("[data-block-content]")!;
  const values: Array<[boolean, boolean, boolean, string | undefined]> = [];
  panel.events.register({ id: "element-scope", type: "click" }, (event) => {
    values.push([event.insideRoot, event.insideBlock, event.insideContent, event.blockId]);
  });
  try {
    panel.setRoot(root);
    content.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    content.firstChild!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(values).toEqual([
      [true, true, true, ""],
      [false, false, false, undefined],
    ]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
