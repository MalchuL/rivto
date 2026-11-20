/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../../../test-utils";
import { listShortcutsExtension } from "../../../../built-ins";

it("does not convert an input queued by a replaced panel root", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core, extensions: [listShortcutsExtension()] });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "- " });
  const initialListProps = panel.blocks.getBlockNode(block.id)!.listProps;
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "list-test";
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "block";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>- </span></div>`;
  const replacement = root.cloneNode(true) as HTMLElement;
  document.body.append(root, replacement);
  let observed = false;
  panel.editor.events.register({ id: "test-list-input", type: "input" }, () => {
    observed = true;
  });
  try {
    panel.setRoot(root);
    root
      .querySelector("[data-block-content]")!
      .dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: " " }),
      );
    expect(observed).toBe(true);
    panel.setRoot(replacement);
    await Promise.resolve();
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("- ");
    expect(panel.blocks.getBlockNode(block.id)?.listProps).toEqual(initialListProps);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
    replacement.remove();
  }
});
