import { expect, test } from "@playwright/test";

test("keeps the Bento dialog open in the full demo", async ({ page }) => {
  await page.goto("/");
  const board = page.locator('[data-block-type="bento"]').first();
  await board.scrollIntoViewIfNeeded();
  await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /^Expanded / })).toBeVisible();
});
