import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`canvas tools reset after switching modes, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const canvas = page.locator(".edgeless-viewport");
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    const fill = page.getByLabel("Default fill", { exact: true });
    const originalFill = await fill.inputValue();
    await fill.evaluate((input: HTMLInputElement) => {
      input.value = "#123456";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(fill).toHaveValue("#123456");
    await toolbar.getByRole("button", { name: "Pan", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-edgeless-tool", "pan");
    await page.locator('[data-editor-mode="block"]').click();
    await expect(canvas).toHaveCount(0);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await expect(canvas).toHaveAttribute("data-edgeless-tool", "select");
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    await expect(fill).toHaveValue(originalFill);
    await toolbar.getByRole("button", { name: "Pan", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(canvas).toHaveAttribute("data-edgeless-tool", "select");
  });
}
