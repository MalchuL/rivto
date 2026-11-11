import { expect, test } from "@playwright/test";

test("menu arrows skip background controls while Tab reaches them", async ({ page }) => {
  await page.goto("/?test_features=1");
  const row = page
    .locator('[data-journal-document="today"] [data-block-id] > .rivto-block-row')
    .first();
  await row.waitFor();
  await row.hover();
  await row
    .locator(":scope > :is(.rivto-slot, .rivto-block-slot) > .block-handle")
    .click({ button: "right" });
  const menu = page.getByRole("menu").first();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Home");
  for (let index = 0; index < 15; index++) {
    await page.keyboard.press("ArrowDown");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await expect(page.locator('[role="group"][aria-label="Block background"] :focus')).toHaveCount(
      0,
    );
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "No color", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Custom background color")).toBeFocused();
  await page.getByLabel("Custom background color").fill("#123456");
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press("Tab");
  }
  const slider = page.getByRole("slider", { name: "Background opacity" });
  await expect(slider).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuenow", "99");
  await page.keyboard.press("Tab");
  await expect(page.locator('[role="group"][aria-label="Block background"] :focus')).toHaveCount(0);
  await page.keyboard.press("Shift+Tab");
  await expect(slider).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "purple", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "No color", exact: true }).click();
  await expect(slider).toHaveAttribute("data-disabled", "");
  await page.getByRole("button", { name: "purple", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator('[role="group"][aria-label="Block background"] :focus')).toHaveCount(0);
  await expect(menu).toBeVisible();
});
