import { expect, test } from "@playwright/test";

test("preserves focus ownership when the editor surface changes", async ({ page }) => {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const content = today.locator("[data-block-content][contenteditable]").first();
  await content.click();
  await expect(content).toBeFocused();
  await page
    .locator('[data-editor-mode="edgeless"]')
    .evaluate((button: HTMLElement) => button.click());
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-rivto-surface")))
    .toBe("edgeless");
  await page
    .locator('[data-editor-mode="block"]')
    .evaluate((button: HTMLElement) => button.click());
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-rivto-surface")))
    .toBe("block");
  await page.evaluate(() => {
    const outside = document.createElement("button");
    outside.id = "outside-focus-fixture";
    document.body.append(outside);
    outside.focus();
  });
  await page
    .locator('[data-editor-mode="edgeless"]')
    .evaluate((button: HTMLElement) => button.click());
  await expect(page.locator("#outside-focus-fixture")).toBeFocused();
});
