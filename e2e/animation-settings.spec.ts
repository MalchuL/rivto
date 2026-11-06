import { expect, test } from "@playwright/test";

for (const setting of ["zero", "omitted"] as const) {
  test(`disables configured animations when durations are ${setting}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.evaluate((value) => {
      const runtime = window as unknown as {
        __rivtoDemo: { reactEditor: { animations: Record<string, number> } };
      };
      const animations = runtime.__rivtoDemo.reactEditor.animations;
      for (const key of ["blockExpand", "collapseIndicator", "boardDialog", "checkbox"]) {
        if (value === "zero") {
          animations[key] = 0;
        } else {
          delete animations[key];
        }
      }
    }, setting);
    const parent = page
      .locator('[data-journal-document="today"] .rivto-block:has(> .rivto-block-children)')
      .first();
    const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
    const children = parent.locator(":scope > .rivto-block-children");
    await toggle.click();
    await expect(children).toBeHidden();
    await expect(children.locator("[data-block-id]")).toHaveCount(0);
    await toggle.click();
    await expect(children).toBeVisible();
    expect(await children.evaluate((element) => element.getAnimations().length)).toBe(0);
    const checkbox = page.getByRole("checkbox", {
      name: /Mark block as (complete|incomplete): Try the interactive checkbox/,
    });
    await checkbox.check();
    const checkmark = checkbox.locator('[data-slot="checkbox-indicator"] > span');
    await expect(checkmark).toHaveCSS("opacity", "1");
    expect(await checkmark.evaluate((element) => element.getAnimations().length)).toBe(0);
    const expand = page.getByRole("button", { name: "Expand Bento", exact: true }).first();
    await expand.scrollIntoViewIfNeeded();
    await expand.click();
    const dialog = page.getByRole("dialog", { name: "Expanded Bento" });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.getAnimations().length)).toBe(0);
    const backdrop = page.locator('[data-slot="dialog-overlay"]').last();
    expect(await backdrop.evaluate((element) => element.getAnimations().length)).toBe(0);
  });
}

test("uses the configured block expansion duration", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const runtime = window as unknown as {
      __rivtoDemo: { reactEditor: { animations: Record<string, number> } };
    };
    runtime.__rivtoDemo.reactEditor.animations.blockExpand = 0.8;
  });
  const parent = page
    .locator('[data-journal-document="today"] .rivto-block:has(> .rivto-block-children)')
    .first();
  const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
  const children = parent.locator(":scope > .rivto-block-children");
  await toggle.click();
  await toggle.click();
  await expect(children).toBeVisible();
  expect(
    await children.evaluate((element) => element.getAnimations()[0]?.effect?.getTiming().duration),
  ).toBe(800);
});
