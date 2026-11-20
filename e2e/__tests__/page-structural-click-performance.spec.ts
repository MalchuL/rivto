import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`selects a structural block by click, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    const separator = today.locator('[data-separator-block="true"]').first();
    const block = separator.locator("xpath=ancestor::*[@data-block-id][1]");
    const text = today.locator("[data-block-content]").first();
    await expect(separator).toBeVisible();
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await text.click();
      await page.evaluate(() => {
        const state = window as unknown as { structuralClickTiming: unknown };
        state.structuralClickTiming = null;
        window.addEventListener(
          "click",
          () => {
            const start = performance.now();
            window.addEventListener(
              "click",
              () => {
                const sync = performance.now() - start;
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    state.structuralClickTiming = { sync, frames: performance.now() - start };
                  }),
                );
              },
              { once: true },
            );
          },
          { capture: true, once: true },
        );
      });
      await separator.click();
      await page.waitForFunction(
        () => (window as unknown as { structuralClickTiming: unknown }).structuralClickTiming,
      );
      samples.push(
        await page.evaluate(
          () => (window as unknown as { structuralClickTiming: unknown }).structuralClickTiming,
        ),
      );
      await expect(block).toHaveAttribute("data-block-selected", "true");
    }
    console.log(JSON.stringify({ interaction: "page-structural-click", repeat, samples }));
  });
}
