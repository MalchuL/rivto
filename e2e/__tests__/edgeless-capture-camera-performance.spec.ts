import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`drawing capture follows a camera pan, repeat=${repeat}`, async ({ page, browserName }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const viewport = page.locator('[data-journal-document="today"] .edgeless-viewport');
    const capture = viewport.locator(".edgeless-drawing-capture");
    await expect(capture).toHaveCount(1);
    await viewport.hover({ position: { x: 24, y: 24 } });
    await viewport.evaluate((root) => {
      root.addEventListener("wheel", () => performance.mark("capture-pan-start"), {
        capture: true,
        once: true,
      });
      window.addEventListener(
        "wheel",
        () => {
          performance.mark("capture-pan-sync");
          requestAnimationFrame(() =>
            requestAnimationFrame(() => performance.mark("capture-pan-rendered")),
          );
        },
        { once: true },
      );
    });
    await page.mouse.wheel(48, 72);
    await expect(viewport).toHaveAttribute("data-edgeless-pan-y", "-72");
    await page.waitForFunction(
      () => performance.getEntriesByName("capture-pan-rendered").length > 0,
    );
    const canvas = (await viewport.boundingBox())!;
    const overlay = (await capture.boundingBox())!;
    expect(overlay.x).toBeCloseTo(canvas.x + 1, 0);
    expect(overlay.y).toBeCloseTo(canvas.y + 1, 0);
    expect(overlay.width).toBeCloseTo(canvas.width - 2, 0);
    expect(overlay.height).toBeCloseTo(canvas.height - 2, 0);
    const sample = await page.evaluate(() => {
      const start = performance.getEntriesByName("capture-pan-start")[0].startTime;
      return {
        sync: performance.getEntriesByName("capture-pan-sync")[0].startTime - start,
        rendered: performance.getEntriesByName("capture-pan-rendered")[0].startTime - start,
      };
    });
    console.log(JSON.stringify({ browserName, repeat, sample }));
  });
}
