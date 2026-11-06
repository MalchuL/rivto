import { expect, test } from "@playwright/test";

for (const type of ["Bento", "Kanban", "Table"]) {
  test(`${type} can expand a collapsed block inside its modal`, async ({ page }) => {
    await page.goto("/?test_features=1");
    const board = page.locator(`[data-block-type="${type.toLowerCase()}"]`).first();
    const expand = board.getByRole("button", { name: `Expand ${type}`, exact: true });
    await expand.scrollIntoViewIfNeeded();
    await expand.click();
    const modal = page.getByRole("dialog", { name: `Expanded ${type}`, exact: true });
    const root = modal.locator(`[data-block-type="${type.toLowerCase()}"]`).first();
    const toggle = root.locator(":scope > .rivto-block-row [data-collapse-toggle]");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
}
