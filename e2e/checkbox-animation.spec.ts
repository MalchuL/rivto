import { expect, test } from "@playwright/test";

test("uses the configured checkbox animation duration", async ({ page }) => {
  await page.goto("/?test_features=1");
  const checkbox = page.getByRole("checkbox", {
    name: /Mark block as (complete|incomplete): Try the interactive checkbox/,
  });
  await checkbox.check();
  const indicator = checkbox.locator('[data-slot="checkbox-indicator"] > span');
  await expect
    .poll(() => indicator.evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
  const timings = await indicator.evaluate((element) =>
    element.getAnimations().map((animation) => animation.effect?.getTiming().duration),
  );
  expect(timings).toContain(600);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`updates checkbox and indicator with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/?test_features=1");
    const checkbox = page.getByRole("checkbox", {
      name: /Mark block as (complete|incomplete): Try the interactive checkbox/,
    });
    const indicator = checkbox.locator('[data-slot="checkbox-indicator"] > span');
    await expect(indicator).toHaveCSS("opacity", "0");
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(indicator).toHaveCSS("opacity", "1");
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    await expect(indicator).toHaveCSS("opacity", "0");
  });
}
