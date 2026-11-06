import { expect, test } from "@playwright/test";

test("fades a newly created block without animating the initial document", async ({ page }) => {
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
  const row = created.locator(":scope > .rivto-block-row");
  expect(await row.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0);
  await expect.poll(() => row.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
});
