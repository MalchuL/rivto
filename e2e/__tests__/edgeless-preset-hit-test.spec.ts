import { expect, test } from "@playwright/test";

test("does not place a dragged preset when released over toolbar controls", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const canvas = page.locator(".edgeless-viewport");
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  const preset = toolbar.getByRole("button", { name: "Ellipse", exact: true });
  const button = (await preset.boundingBox())!;
  const area = (await canvas.boundingBox())!;
  const shapes = page.locator('[data-edgeless-visual-kind="ellipse"]');
  const count = await shapes.count();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + 650, area.y + 400, { steps: 8 });
  await expect(page.locator(".edgeless-preset-ghost")).toBeVisible();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".edgeless-preset-ghost")).toHaveCount(0);
  await expect(shapes).toHaveCount(count);
});
