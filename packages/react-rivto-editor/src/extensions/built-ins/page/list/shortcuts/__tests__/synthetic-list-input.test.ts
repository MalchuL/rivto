/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../../../test-utils";
import { listShortcutsExtension } from "../../../../built-ins";

it("converts a synthetic beforeinput carrying text editing fields", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core, extensions: [listShortcutsExtension()] });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "-" });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "synthetic-list";
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "block";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>-</span></div>`;
  document.body.append(root);
  try {
    panel.setRoot(root);
    const event = new Event("beforeinput", { bubbles: true, cancelable: true });
    Object.assign(event, { inputType: "insertText", data: " " });
    root.querySelector("[data-block-content]")!.dispatchEvent(event);
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("");
    expect(panel.blocks.getBlockNode(block.id)?.listProps.type).toBe("list");
    expect(event.defaultPrevented).toBe(true);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
