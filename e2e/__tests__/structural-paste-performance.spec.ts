import { expect, test, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`pastes a selected block, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    const target = today
      .locator("[data-block-content]")
      .filter({ hasText: /^Finish the selection/ })
      .first();
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await target.click({ modifiers: ["Control"] });
      const selected = today.locator("[data-block-selected]");
      await expect(selected).toHaveCount(1);
      const selectedId = await selected.getAttribute("data-block-id");
      expect(selectedId).toBeTruthy();
      await page.keyboard.press("Control+c");
      samples.push(await measurePaste(page));
      await expect(selected).toHaveCount(1);
      await expect(selected).not.toHaveAttribute("data-block-id", selectedId!);
      await page.keyboard.press("Control+z");
    }
    console.log(JSON.stringify({ interaction: "structural-paste", repeat, samples }));
  });
}

/**
 * Measures the native paste event and its following two browser frames.
 *
 * @param page - Warm demo with one copied block selected.
 * @returns Synchronous paste delivery and two-frame durations in milliseconds.
 */
async function measurePaste(page: Page): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { structuralPasteTiming: unknown };
    state.structuralPasteTiming = null;
    window.addEventListener(
      "paste",
      () => {
        const start = performance.now();
        window.addEventListener(
          "paste",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.structuralPasteTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.press("Control+v");
  await page.waitForFunction(
    () => (window as unknown as { structuralPasteTiming: unknown }).structuralPasteTiming,
  );
  return page.evaluate(
    () => (window as unknown as { structuralPasteTiming: unknown }).structuralPasteTiming,
  );
}
