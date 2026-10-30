import { expect, test } from "@playwright/test";

for (const route of ["/", "/?editors=2", "/?sync=1&room=block-labels"]) {
  test(`block labels default to hidden and can be toggled on ${route}`, async ({ page }) => {
    await page.goto(route);
    const numbers = page.getByRole("checkbox", { name: "Block numbers", exact: true }).first();
    const ids = page.getByRole("checkbox", { name: "Block IDs", exact: true }).first();
    await expect(numbers).not.toBeChecked();
    await expect(ids).not.toBeChecked();
    await expect(page.locator(".demo-block-number")).toHaveCount(0);
    await expect(page.locator(".demo-block-id")).toHaveCount(0);
    await numbers.check();
    await expect(page.locator(".demo-block-number").first()).toBeVisible();
    await expect(page.locator(".demo-block-id")).toHaveCount(0);
    await ids.check();
    await expect(page.locator(".demo-block-id").first()).toBeVisible();
    await numbers.uncheck();
    await expect(page.locator(".demo-block-number")).toHaveCount(0);
    await expect(page.locator(".demo-block-id").first()).toBeVisible();
    await ids.uncheck();
    await expect(page.locator(".demo-block-id")).toHaveCount(0);
    await page.getByRole("button", { name: "Edgeless", exact: true }).first().click();
    await ids.check();
    await expect(page.locator(".edgeless-card .demo-block-id").first()).toBeVisible();
    await numbers.check();
    await expect(
      page.locator(".edgeless-card > [data-block-id] > .rivto-block-row .demo-block-number"),
    ).toHaveCount(0);
  });
}
