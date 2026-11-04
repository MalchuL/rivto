import { expect, test } from "@playwright/test";

test("toggles nesting lines without reloading the editor", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  const toggle = page.getByRole("checkbox", { name: "Nesting lines" });
  await expect(toggle).toBeChecked();
  await expect(page.locator("[data-nesting-lines]").first()).toBeAttached();
  await toggle.uncheck();
  await expect(page.locator("[data-nesting-lines]")).toHaveCount(0);
  await toggle.check();
  await expect(page.locator("[data-nesting-lines]").first()).toBeAttached();
});
