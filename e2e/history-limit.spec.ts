import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test("keyboard undo stops at the default history limit", async ({ page }) => {
  await page.goto("/?test_features=1");
  const content = page.locator('[data-journal-document="today"] [data-block-content]').first();
  await expect(content).toBeVisible();
  const id = await content.evaluate(
    (element) => element.closest<HTMLElement>("[data-block-id]")!.dataset.blockId!,
  );
  await page.evaluate((blockId) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.history.batchUpdatesWithoutHistory(() =>
      editor.blocks.updateBlock(blockId, { content: "History 0" }),
    );
    editor.history.clear();
    for (let index = 1; index <= 101; index++) {
      editor.history.batchUpdates(() =>
        editor.blocks.updateBlock(blockId, { content: `History ${index}` }),
      );
    }
    for (let index = 0; index < 99; index++) {
      editor.history.undo();
    }
  }, id);
  await expect(content).toHaveText("History 2");
  await content.click();
  await page.keyboard.press("Control+z");
  await expect(content).toHaveText("History 1");
  await page.keyboard.press("Control+z");
  await expect(content).toHaveText("History 1");
  await page.keyboard.press("Control+Shift+z");
  await expect(content).toHaveText("History 2");
});
