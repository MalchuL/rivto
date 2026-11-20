import { expect, test } from "@playwright/test";

test("registered sticky presets retain their shared toolbar button styling", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  await page
    .getByRole("toolbar", { name: "Visual objects" })
    .getByRole("button", { name: "Stickies" })
    .click();
  const preset = page
    .getByRole("dialog", { name: "stickers tools" })
    .getByRole("button", { name: "Pink sticky" });
  await expect(preset).toHaveClass(/edgeless-creation-panel-sticker-preset/);
  await preset.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".edgeless-drawing-capture[data-active]")).toBeVisible();
});
