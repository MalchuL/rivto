/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { ContentInput } from "../types";

it("compares input and selection content hosts within the same mounted occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "content-occurrence";
  root.innerHTML = '<div data-block-id="one"><span data-block-content>original</span></div>';
  const block = root.querySelector("[data-block-id]")!;
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  let captured: ContentInput | undefined;
  panel.events.register({ id: "content-identity", type: "input" }, (event) => {
    captured = event.contentInput;
  });
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    content.dispatchEvent(new Event("input", { bubbles: true }));
    const current = panel.selection.contentInput("one");
    expect(captured?.isSameHost(current!)).toBe(true);
    const replacement = document.createElement("span");
    replacement.setAttribute("data-block-content", "");
    replacement.textContent = "replacement";
    block.replaceChildren(replacement);
    const replaced = panel.selection.contentInput("one");
    expect(captured?.isSameHost(replaced!)).toBe(false);
    expect(captured?.readText()).toBe("original");
    expect(captured?.readAncestorAttribute("[data-block-id]", "data-block-id")).toBeUndefined();
    panel.setRoot(null);
    expect(inputRoot.isAttached()).toBe(false);
    expect(panel.selection.contentInput("one")).toBeUndefined();
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});
