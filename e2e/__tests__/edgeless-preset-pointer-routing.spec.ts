import { expect, test } from "@playwright/test";

for (const finish of ["escape", "stopped-release"] as const) {
  test(`toolbar preset ${finish} completes through its owning gesture`, async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    const preset = toolbar.getByRole("button", { name: "Ellipse", exact: true });
    if (finish === "stopped-release") {
      await preset.evaluate((button) =>
        button.addEventListener("pointerup", (event) => event.stopPropagation(), { once: true }),
      );
    }
    const button = (await preset.boundingBox())!;
    const canvas = (await page.locator(".edgeless-viewport").boundingBox())!;
    const shapes = page.locator('[data-edgeless-visual-kind="ellipse"]');
    const before = await shapes.count();
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 650, canvas.y + 400, { steps: 8 });
    await expect(page.locator(".edgeless-preset-ghost")).toBeVisible();
    if (finish === "escape") {
      await page.keyboard.press("Escape");
    }
    await page.mouse.up();
    await expect(page.locator(".edgeless-preset-ghost")).toHaveCount(0);
    await expect(shapes).toHaveCount(before + (finish === "stopped-release" ? 1 : 0));
  });
}

test("does not begin a preset gesture from a disabled toolbar button", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  const preset = toolbar.getByRole("button", { name: "Ellipse", exact: true });
  await preset.evaluate((button) => button.setAttribute("disabled", ""));
  const button = (await preset.boundingBox())!;
  const canvas = (await page.locator(".edgeless-viewport").boundingBox())!;
  const shapes = page.locator('[data-edgeless-visual-kind="ellipse"]');
  const before = await shapes.count();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 650, canvas.y + 400, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".edgeless-preset-ghost")).toHaveCount(0);
  await expect(shapes).toHaveCount(before);
});
