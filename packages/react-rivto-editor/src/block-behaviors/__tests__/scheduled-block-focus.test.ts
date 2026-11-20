/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { scheduleBlockFocus } from "../utils/focus-ops";

it("focuses a block in the invoking surface and ignores a replaced surface", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const roots = [document.createElement("div"), document.createElement("div")];
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  for (const root of roots) {
    root.dataset.rivtoBlockEditor = "true";
    root.innerHTML = `<div data-block-id="${block.id}"><span data-block-content contenteditable="true" tabindex="0">text</span></div>`;
    document.body.append(root);
  }
  try {
    panel.setRoot(roots[0]!);
    const original = panel.inputRoot;
    scheduleBlockFocus(panel, block.id, 1, original);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(document.activeElement).toBe(roots[0]!.querySelector("[data-block-content]"));
    panel.setRoot(roots[1]!);
    scheduleBlockFocus(panel, block.id, 1, original);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(document.activeElement).not.toBe(roots[1]!.querySelector("[data-block-content]"));
  } finally {
    panel.editor.destroy();
    await core.destroy();
    roots.forEach((root) => root.remove());
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("does not focus a duplicate block inside a nested editor occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-rivto-block-editor><div data-block-id="${block.id}"><span data-block-content contenteditable="true" tabindex="0">nested</span></div></div><div data-block-id="${block.id}"><span data-block-content contenteditable="true" tabindex="0">text</span></div>`;
  document.body.append(root);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  try {
    panel.setRoot(root);
    scheduleBlockFocus(panel, block.id, 1, panel.inputRoot);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(document.activeElement).toBe(root.querySelectorAll("[data-block-content]")[1]);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
