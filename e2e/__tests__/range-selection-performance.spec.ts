import { expect, test } from "@playwright/test";
import { HOST_BLOCK_ID_SELECTOR } from "../dom-markers";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of mode === "block" ? [0, 200] : [0]) {
    test(`extends block selection in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.goto(`/?repeat=${repeat}`);
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const contents = page
        .locator(
          '[data-journal-document="today"] [data-block-content]:not(:empty):not([data-rivto-panel] [data-rivto-panel] [data-block-content])',
        )
        .filter({
          hasText: /^(Start a selection in|This complete|Nested branch one owns)/,
        });
      await expect(contents).toHaveCount(3);
      const samples = [];
      for (let index = 0; index < 3; index++) {
        await contents.nth(0).click();
        await page.evaluate(() => {
          const state = window as unknown as {
            rangeTiming: null | { sync: number; frames: number };
          };
          state.rangeTiming = null;
          let start = 0;
          window.addEventListener(
            "pointerdown",
            () => {
              start = performance.now();
            },
            { capture: true, once: true },
          );
          window.addEventListener(
            "pointerdown",
            () => {
              const sync = performance.now() - start;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  state.rangeTiming = { sync, frames: performance.now() - start };
                }),
              );
            },
            { once: true },
          );
        });
        await contents.nth(2).click({ modifiers: ["Shift"] });
        await expect(page.locator(`${HOST_BLOCK_ID_SELECTOR}[data-block-selected]`)).toHaveCount(3);
        await page.waitForFunction(
          () => (window as unknown as { rangeTiming: unknown }).rangeTiming !== null,
        );
        samples.push(
          await page.evaluate(() => (window as unknown as { rangeTiming: unknown }).rangeTiming),
        );
      }
      console.log(JSON.stringify({ interaction: "range-selection", mode, repeat, samples }));
    });
  }
}
