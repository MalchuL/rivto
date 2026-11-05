import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  test(`nesting lines leave room for drop feedback and return in ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto("/?test_features=1");
    await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
    await page.evaluate((surface) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      editor.blocks.insertBlock({ id: "source", type: "todo-item", content: "Source" });
      editor.blocks.insertBlock({
        id: "parent",
        type: "paragraph",
        content: "Parent",
        children: [
          { id: "target", type: "todo-item", content: "Target" },
          { id: "next", type: "paragraph", content: "Next" },
        ],
      });
      if (surface === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 850, height: 800 },
          props: { startBlockId: "source", endBlockId: "parent" },
        });
      }
    }, mode);
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    const target = page.locator('[data-block-id="target"]');
    await expect(target).toBeVisible();
    const path = page.locator("[data-nesting-lines] path").first();
    await expect.poll(() => path.getAttribute("d")).toMatch(/^M /);
    const original = await path.getAttribute("d");
    const row = page.locator('[data-block-id="source"] > .rivto-block-row');
    await row.hover();
    const handle = (await row.locator(".block-handle").boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 10, handle.y + handle.height / 2);
    const bounds = (await target.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 6 });
    await expect(target).toHaveAttribute("data-block-drop-active", "true");
    await expect.poll(() => path.getAttribute("d")).not.toBe(original);
    await expect(path).toHaveAttribute("d", /^M /);
    await page.mouse.move(1490, 100);
    await expect(target).not.toHaveAttribute("data-block-drop-active");
    await expect.poll(() => path.getAttribute("d")).toBe(original);
    await page.mouse.up();
  });
}
