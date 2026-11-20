import { expect, test, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`resets the canvas tool with Escape, repeat=${repeat}`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    await today.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    const pan = toolbar.getByRole("button", { name: "Pan", exact: true });
    const select = toolbar.getByRole("button", { name: "Select", exact: true });
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await pan.click();
      await expect(pan).toHaveAttribute("aria-pressed", "true");
      samples.push(await measureEscape(page));
      await expect(select).toHaveAttribute("aria-pressed", "true");
    }
    console.log(
      JSON.stringify({ interaction: "edgeless-tool-escape", browserName, repeat, samples }),
    );
  });
}

/**
 * Measures one Escape delivery and the two following browser frames.
 *
 * @param page - Warm canvas with the Pan tool active.
 * @returns Synchronous key delivery and two-frame durations in milliseconds.
 * @throws If browser input or timing observation fails.
 */
async function measureEscape(page: Page): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { toolEscapeTiming: unknown };
    state.toolEscapeTiming = null;
    window.addEventListener(
      "keydown",
      () => {
        const start = performance.now();
        window.addEventListener(
          "keydown",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.toolEscapeTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => (window as unknown as { toolEscapeTiming: unknown }).toolEscapeTiming,
  );
  return page.evaluate(() => (window as unknown as { toolEscapeTiming: unknown }).toolEscapeTiming);
}
