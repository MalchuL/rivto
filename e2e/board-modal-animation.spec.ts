import { expect, test } from "@playwright/test";

test("fades the expanded board without transforming its editor", async ({ page }) => {
  await page.goto("/?test_features=1");
  const expand = page.getByRole("button", { name: "Expand Bento", exact: true }).first();
  await expand.scrollIntoViewIfNeeded();
  await expand.click();
  const dialog = page.getByRole("dialog", { name: "Expanded Bento" });
  await expect(dialog).toBeVisible();
  const animation = await dialog.evaluate((element) => ({
    running: element.getAnimations().some((item) => item.playState === "running"),
    transform: getComputedStyle(element).transform,
  }));
  expect(animation.running).toBe(true);
  expect(animation.transform).toBe("none");
  const backdrop = page.locator('[data-slot="dialog-overlay"]').last();
  expect(
    await backdrop.evaluate((element) => element.getAnimations()[0]?.effect?.getTiming().duration),
  ).toBe(200);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
});
