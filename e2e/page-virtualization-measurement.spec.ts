import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`does not measure root wrappers when Page windowing is disabled, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const state = window as unknown as { rootMeasurements: number };
      state.rootMeasurements = 0;
      const observe = ResizeObserver.prototype.observe;
      ResizeObserver.prototype.observe = function (target, options) {
        if (target.classList.contains("rivto-virtual-root")) {
          state.rootMeasurements += 1;
        }
        return observe.call(this, target, options);
      };
    });
    await page.goto(`/?repeat=${repeat}`);
    const roots = page.locator('[data-journal-document="today"] .rivto-virtual-root');
    await expect(roots.first()).toBeVisible();
    if (repeat > 0) {
      expect(await roots.count()).toBeGreaterThan(200);
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(
      await page.evaluate(
        () => (window as unknown as { rootMeasurements: number }).rootMeasurements,
      ),
    ).toBe(0);
  });
}
