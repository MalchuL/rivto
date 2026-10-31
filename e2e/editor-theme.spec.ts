import { expect, test } from "@playwright/test";

test("uses the high contrast editor palette in page and edgeless modes", async ({ page }) => {
  await page.goto("/?test_features=1");
  await expect(page.locator("body")).toHaveCSS("background-image", "none");
  await expect(page.locator('[data-journal-document="today"] .demo-header')).toHaveCSS(
    "background-image",
    "none",
  );
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await expect(surface).toBeVisible();
  await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator('[data-editor-mode="block"]')).toHaveCSS(
    "background-color",
    "rgb(182, 192, 251)",
  );
  for (const name of ["Delete", "Undo"]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toHaveAttribute("title", name);
    await expect(button.locator("svg[aria-hidden='true']")).toBeVisible();
  }

  await page.locator('[data-editor-mode="edgeless"]').click();
  const canvas = page.locator(".edgeless-viewport");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS("background-color", "rgb(228, 232, 240)");
  await expect(page.getByRole("toolbar", { name: "Visual objects" })).toHaveCSS(
    "background-image",
    "none",
  );
  await expect(page.locator('[data-editor-mode="edgeless"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator('[data-editor-action="undo"]')).toHaveCSS("transition-duration", "0s");
});
