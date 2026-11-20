import { expect, test } from "@playwright/test";

test("updates the canvas spotlight while the pointer is over a nested editor", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const viewport = page.locator(".edgeless-viewport");
  const nested = viewport.locator("[data-rivto-block-editor]").first();
  await expect(nested).toBeVisible();
  const viewportBounds = await viewport.boundingBox();
  const nestedBounds = await nested.boundingBox();
  expect(viewportBounds).not.toBeNull();
  expect(nestedBounds).not.toBeNull();
  const x = nestedBounds!.x + 20;
  const y = nestedBounds!.y + 20;
  await page.mouse.move(x, y);
  const spotlight = viewport.locator(".edgeless-grid-spotlight");
  await expect(spotlight).toHaveCSS("--rivto-edgeless-pointer-x", `${x - viewportBounds!.x}px`);
  await expect(spotlight).toHaveCSS("--rivto-edgeless-pointer-y", `${y - viewportBounds!.y}px`);
});
