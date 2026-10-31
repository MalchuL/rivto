import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Prepends a populated block with a real handle and a checkbox for the next-click check.
 *
 * @param page - Browser page owning native input.
 * @param mode - Surface rendering the same canonical block and navigation callback.
 * @returns Resolves when the handle and its child checkbox are mounted.
 */
async function load(page: Page, mode: "block" | "edgeless"): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.blocks.insertBlock(
      {
        id: "click-gesture",
        type: "paragraph",
        content: "Click gesture root",
        children: [
          {
            id: "click-checkbox",
            type: "paragraph",
            content: "Check stays responsive",
            listProps: { type: "checkbox" },
          },
        ],
      },
      { parentId: null, beforeId: editor.blocks.getRootIds()[0] },
    );
    editor.history.clear();
  });
  await page.locator(`[data-editor-mode="${mode}"]`).click();
}

for (const mode of ["block", "edgeless"] as const) {
  for (const distance of [3, 4, 48]) {
    test(`handle round trip of ${distance}px on ${mode} preserves the intended click`, async ({
      page,
    }) => {
      await load(page, mode);
      const today = page.locator('[data-journal-document="today"]');
      const row = today.locator('[data-block-id="click-gesture"] > .rivto-block-row');
      const handle = row.locator(".block-handle");
      await row.hover();
      await handle.hover();
      const rect = (await handle.boundingBox())!;
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + distance, y, { steps: 5 });
      if (distance < 4) {
        await expect(page.locator(".rivto-block-drag-preview")).not.toBeVisible();
      } else {
        await expect(page.locator(".rivto-block-drag-preview")).toBeVisible();
      }
      await page.mouse.move(x, y, { steps: 5 });
      await page.mouse.up();
      const panel = today.locator("[data-panel-root]").first();
      if (distance < 4) {
        await expect(panel).toHaveAttribute("data-panel-root", "click-gesture");
        return;
      }
      await expect(panel).toHaveAttribute("data-panel-root", "");
      const checkbox = today.locator('[data-block-id="click-checkbox"]').getByRole("checkbox");
      await checkbox.click();
      await expect(checkbox).toBeChecked();
      if (distance === 4) {
        await handle.focus();
        await handle.press("Enter");
      } else {
        await row.hover();
        await handle.click();
      }
      await expect(panel).toHaveAttribute("data-panel-root", "click-gesture");
    });
  }
}
