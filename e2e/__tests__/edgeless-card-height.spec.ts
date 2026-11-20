import { expect, test } from "@playwright/test";

test("remeasures auto-height cards after content changes and surface remount", async ({ page }) => {
  await page.goto("/");
  for (let mount = 0; mount < 2; mount += 1) {
    await page.locator('[data-editor-mode="edgeless"]').click();
    const card = page.locator('[data-edgeless-root][data-auto-height="true"]').first();
    const content = card.locator("[data-edgeless-card-content]");
    const child = content.locator(":scope > *").first();
    await expect(child).toBeVisible();
    const initialHeight = await card.evaluate((element) => element.getBoundingClientRect().height);
    await child.evaluate((element) => {
      (element as HTMLElement).style.minHeight = "1200px";
    });
    await expect
      .poll(() => card.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(initialHeight + 200);
    await child.evaluate((element) => {
      (element as HTMLElement).style.minHeight = "";
    });
    await expect
      .poll(() => card.evaluate((element) => element.getBoundingClientRect().height))
      .toBeLessThan(initialHeight + 100);
    if (mount === 0) {
      await page.locator('[data-editor-mode="block"]').click();
    }
  }
});
