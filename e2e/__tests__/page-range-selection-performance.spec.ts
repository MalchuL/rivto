import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`extends a structural selection by pointer, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const contents = page
      .locator(
        '[data-journal-document="today"] [data-block-content]:not(:empty):not([data-rivto-panel] [data-rivto-panel] [data-block-content])',
      )
      .filter({ hasText: /^(Start a selection in|This complete|Nested branch one owns)/ });
    await expect(contents).toHaveCount(3);
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await contents.first().click();
      await page.evaluate(() => {
        const state = window as unknown as { rangeTiming: unknown };
        state.rangeTiming = null;
        window.addEventListener(
          "pointerdown",
          () => {
            const start = performance.now();
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
          },
          { capture: true, once: true },
        );
      });
      await contents.nth(2).click({ modifiers: ["Shift"] });
      await page.waitForFunction(() => (window as unknown as { rangeTiming: unknown }).rangeTiming);
      samples.push(
        await page.evaluate(() => (window as unknown as { rangeTiming: unknown }).rangeTiming),
      );
      await expect(
        contents.first().locator("xpath=ancestor::*[@data-block-id][1]"),
      ).toHaveAttribute("data-block-selected", "true");
      await expect(contents.nth(2).locator("xpath=ancestor::*[@data-block-id][1]")).toHaveAttribute(
        "data-block-selected",
        "true",
      );
    }
    console.log(JSON.stringify({ interaction: "page-range-selection", repeat, samples }));
  });
}
