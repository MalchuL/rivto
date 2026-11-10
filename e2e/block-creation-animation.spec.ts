import { expect, test } from "@playwright/test";

test("creates a block from Enter without animation", async ({ page }) => {
  await page.goto("/?test_features=1");
  const editor = page.locator('[data-journal-document="today"] > .page-surface');
  const content = editor.locator("[data-block-content]").first();
  const original = content.locator("xpath=ancestor::*[@data-block-id][1]");
  const originalId = await original.getAttribute("data-block-id");
  expect(await original.evaluate((element) => element.getAnimations().length)).toBe(0);
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  const created = editor
    .locator("[data-block-content]:focus")
    .locator("xpath=ancestor::*[@data-block-id][1]");
  await expect(created).not.toHaveAttribute("data-block-id", originalId!);
  expect(await created.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect
    .poll(() => created.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
});
