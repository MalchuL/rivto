import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test("keeps the Markdown editing layer inside its preview and accepts native editing", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('[data-journal-document="today"] [data-block-content]').first(),
  ).toBeVisible();
  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
      .__rivtoDemo;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({ id: "geometry-text", type: "paragraph", content: "Editable text" });
  });
  const block = page.locator('[data-block-id="geometry-text"]');
  const content = block.locator("[data-block-content]");
  const preview = block.locator(".markdown-content");
  await expect(content).toBeVisible();
  const contentBox = (await content.boundingBox())!;
  const previewBox = (await preview.boundingBox())!;
  expect(contentBox.height).toBeCloseTo(previewBox.height, 1);
  expect(contentBox.width).toBeCloseTo(previewBox.width, 1);
  await content.click();
  await expect(content).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(" updated");
  await expect(content).toHaveText("Editable text updated");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-journal-document="today"] [data-block-content]')).toHaveCount(2);
});
