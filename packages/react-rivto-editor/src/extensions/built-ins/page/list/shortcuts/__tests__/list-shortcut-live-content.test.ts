/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../../../../test-utils";
import { registerListShortcuts } from "../register";

it("reads content changes made by an earlier handler during the same input delivery", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "old" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.rivtoSurface = "block";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>old</span></div>`;
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  document.body.append(root);
  panel.editor.events.register({ id: "earlier-input", type: "beforeinput" }, () => {
    content.textContent = "-";
  });
  registerListShortcuts(panel.editor);
  try {
    panel.setRoot(root);
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: " ",
    });
    content.dispatchEvent(event);
    expect(panel.blocks.getBlockNode(block.id)?.listProps.type).toBe("list");
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("");
    expect(event.defaultPrevented).toBe(true);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("keeps reading the original content host if an earlier handler replaces it", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "old" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>old</span></div>`;
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  document.body.append(root);
  let observed: string | undefined;
  panel.editor.events.register({ id: "replace-content", type: "beforeinput" }, () => {
    content.textContent = "updated";
    const replacement = content.cloneNode(false) as HTMLElement;
    replacement.textContent = "replacement";
    content.replaceWith(replacement);
  });
  panel.editor.events.register({ id: "read-content", type: "beforeinput" }, (event) => {
    observed = event.readContentText?.();
  });
  try {
    panel.setRoot(root);
    content.dispatchEvent(new InputEvent("beforeinput", { bubbles: true }));
    expect(observed).toBe("updated");
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not convert beforeinput from a registration replaced during dispatch", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "-" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>-</span></div>`;
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  document.body.append(root);
  panel.editor.events.register({ id: "replace-registration", type: "beforeinput" }, () => {
    panel.setEnabled(false);
    panel.setEnabled(true);
  });
  registerListShortcuts(panel.editor);
  try {
    panel.setRoot(root);
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: " ",
    });
    content.dispatchEvent(event);
    expect(panel.blocks.getBlockNode(block.id)?.content).toBe("-");
    expect(panel.blocks.getBlockNode(block.id)?.listProps.type).not.toBe("list");
    expect(event.defaultPrevented).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
