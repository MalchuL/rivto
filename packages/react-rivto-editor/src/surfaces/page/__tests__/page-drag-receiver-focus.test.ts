/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { PageDragOccurrence } from "../page-drag-occurrence";

it("focuses only the current connected receiving registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.tabIndex = 0;
  document.body.append(root);
  let focusCount = 0;
  root.focus = () => {
    focusCount += 1;
  };
  const targets = { resolve: () => undefined };
  const previous = new PageDragOccurrence(panel, targets, new BrowserInputRoot(root), {
    isCurrent: () => true,
  });
  expect(previous).not.toHaveProperty("root");
  expect(previous).not.toHaveProperty("receiver");
  expect(previous).not.toHaveProperty("targets");
  expect(previous).not.toHaveProperty("reactPanel");
  expect(previous).not.toHaveProperty("resolvePlacement");
  let replacement: PageDragOccurrence | undefined;
  try {
    previous.focus();
    expect(focusCount).toBe(1);
    replacement = new PageDragOccurrence(panel, targets, new BrowserInputRoot(root), {
      isCurrent: () => true,
    });
    expect(previous.region.isSame(replacement.region)).toBe(false);
    previous.focus();
    expect(focusCount).toBe(1);
    replacement.focus();
    expect(focusCount).toBe(2);
    root.remove();
    replacement.focus();
    expect(focusCount).toBe(2);
    document.body.append(root);
    replacement.destroy();
    replacement.focus();
    previous.focus();
    expect(focusCount).toBe(2);
  } finally {
    replacement?.destroy();
    previous.destroy();
    root.remove();
    panel.editor.destroy();
    core.destroy();
  }
});
