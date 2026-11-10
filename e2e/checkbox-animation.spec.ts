import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`updates checkbox and indicator with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/?test_features=1");
    const checkbox = page.getByRole("checkbox", {
      name: /Mark block as (complete|incomplete): Try the interactive checkbox/,
    });
    const indicator = checkbox.locator('[data-slot="checkbox-indicator"]');
    await expect(indicator).toHaveCount(0);
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await expect(indicator).toBeVisible();
    expect(await indicator.evaluate((element) => element.getAnimations().length)).toBe(0);
    await page.keyboard.press("Space");
    await expect(checkbox).not.toBeChecked();
    await expect(indicator).toHaveCount(0);
  });
}
