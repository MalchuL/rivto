import { expect, test } from "@playwright/test";

test("drawing capture follows the canvas camera instead of viewport markers", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const viewport = page.locator('[data-journal-document="today"] .edgeless-viewport');
  const capture = viewport.locator(".edgeless-drawing-capture");
  await expect(capture).toHaveCount(1);
  const before = (await capture.boundingBox())!;
  await viewport.evaluate((root) => root.setAttribute("data-edgeless-pan-x", "8000"));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const after = (await capture.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  await viewport.hover({ position: { x: 24, y: 24 } });
  await page.mouse.wheel(48, 72);
  await expect(viewport).toHaveAttribute("data-edgeless-pan-x", "-48");
  const bounds = (await viewport.boundingBox())!;
  await expect.poll(async () => (await capture.boundingBox())!.x).toBeCloseTo(bounds.x + 1, 0);
});
