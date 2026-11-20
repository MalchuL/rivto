import { expect, test, type Page } from "@playwright/test";
import { ROOT_BLOCK_SELECTOR } from "../dom-markers";

for (const repeat of [0, 200]) {
  test(`repairs selection after collapsing a parent, repeat=${repeat}`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const surface = page.locator('[data-journal-document="today"] > .page-surface');
    const parent = surface.locator(`${ROOT_BLOCK_SELECTOR}:has(> .rivto-block-children)`).first();
    const child = parent.locator(":scope > .rivto-block-children [data-block-content]").first();
    const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await child.click();
      await prepareTiming(page);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(parent).toHaveAttribute("data-block-selected", "true");
      await expect.poll(() => page.evaluate(() => getSelection()?.rangeCount ?? 0)).toBe(0);
      await page.waitForFunction(
        () => (window as unknown as { collapseTiming: unknown }).collapseTiming,
      );
      samples.push(
        await page.evaluate(
          () => (window as unknown as { collapseTiming: unknown }).collapseTiming,
        ),
      );
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    }
    console.log(
      JSON.stringify({ interaction: "collapse-selection", browserName, repeat, samples }),
    );
  });
}

/**
 * Measures the next click's synchronous delivery and two following animation frames.
 *
 * @param page - Warm demo before clicking its collapse control.
 * @returns Timing listeners are installed for the next click.
 * @throws If the browser cannot install the timing listeners.
 */
async function prepareTiming(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as unknown as { collapseTiming: unknown };
    state.collapseTiming = null;
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
                state.collapseTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
}
