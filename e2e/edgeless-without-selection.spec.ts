import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test("renders edgeless visuals without installing the selection extension", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?test_features=1&noEdgelessSelection=1");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const id = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    return editor.elements.insertElement({
      type: "rectangle",
      frame: { x: 400, y: 200, width: 120, height: 80 },
      props: { fill: "#ddddff" },
      zIndex: 10000,
    }).id;
  });
  await expect(page.locator(`[data-edgeless-object-id="${id}"]`)).toBeVisible();
  expect(errors).toEqual([]);
});
