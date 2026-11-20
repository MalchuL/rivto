import { expect, test } from "@playwright/test";

test("retains a creation menu for outside input and closes it on Escape", async ({ page }) => {
  await page.goto("/");
  const toolbar = page.getByRole("toolbar", { name: "Canvas tools", exact: true });
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "demo-shapes", exact: true });
  await expect(menu).toBeVisible();
  const canvas = page.getByRole("main", { name: "Independent canvas" });
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + 20, bounds.y + 20);
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Select", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
