import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`tracks pointer movement on the edgeless grid, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    await page.locator('[data-editor-mode="edgeless"]').click();
    const viewport = page.locator(".edgeless-viewport");
    await viewport.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const bounds = await viewport.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + 100, bounds!.y + 100);
    const samples = [];
    for (let index = 0; index < 3; index++) {
      const x = 130 + index * 10;
      const y = 140 + index * 10;
      await page.evaluate(() => {
        const state = window as unknown as { spotlightTiming: unknown };
        state.spotlightTiming = null;
        window.addEventListener(
          "pointermove",
          () => {
            const start = performance.now();
            window.addEventListener(
              "pointermove",
              () => {
                const sync = performance.now() - start;
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    state.spotlightTiming = { sync, frames: performance.now() - start };
                  }),
                );
              },
              { once: true },
            );
          },
          { capture: true, once: true },
        );
      });
      await page.mouse.move(bounds!.x + x, bounds!.y + y);
      await page.waitForFunction(
        () => (window as unknown as { spotlightTiming: unknown }).spotlightTiming,
      );
      samples.push(
        await page.evaluate(
          () => (window as unknown as { spotlightTiming: unknown }).spotlightTiming,
        ),
      );
      await expect(viewport.locator(".edgeless-grid-spotlight")).toHaveCSS(
        "--rivto-edgeless-pointer-x",
        `${x}px`,
      );
      await expect(viewport.locator(".edgeless-grid-spotlight")).toHaveCSS(
        "--rivto-edgeless-pointer-y",
        `${y}px`,
      );
    }
    console.log(JSON.stringify({ interaction: "edgeless-spotlight", repeat, samples }));
  });
}
