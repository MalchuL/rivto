import { expect, test } from "@playwright/test";
import type { WrapperMountTiming, WrapperMountTimingWindow } from "./types";

for (const repeat of [1, 200]) {
  test(`mounts wrapped blocks at repeat=${repeat} @performance`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(`/?repeat=${repeat}`);
    const toggle = page.getByRole("checkbox", { name: "Demo wrapper", exact: true });
    const wrappers = page.locator("[data-demo-wrapper]");
    const samples: WrapperMountTiming[] = [];
    for (let index = 0; index < 4; index += 1) {
      await toggle.evaluate((toggleElement, expectedCount) => {
        const state = window as unknown as WrapperMountTimingWindow;
        state.wrapperMountTiming = null;
        let start = 0;
        const observer = new MutationObserver(() => {
          if (document.querySelectorAll("[data-demo-wrapper]").length !== expectedCount) {
            return;
          }
          observer.disconnect();
          const mount = performance.now() - start;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              state.wrapperMountTiming = { mount, frames: performance.now() - start };
            }),
          );
        });
        observer.observe(document.body, { childList: true, subtree: true });
        toggleElement.addEventListener(
          "click",
          () => {
            start = performance.now();
          },
          { capture: true, once: true },
        );
      }, repeat * 6);
      await toggle.check();
      await expect(wrappers).toHaveCount(repeat * 6);
      await page.waitForFunction(
        () => (window as unknown as WrapperMountTimingWindow).wrapperMountTiming !== null,
      );
      const timing = await page.evaluate(
        () => (window as unknown as WrapperMountTimingWindow).wrapperMountTiming,
      );
      if (!timing) {
        throw new Error("Expected completed wrapper mount timing");
      }
      if (index > 0) {
        samples.push(timing);
      }
      await toggle.uncheck();
      await expect(wrappers).toHaveCount(0);
    }
    console.log(`wrapper mount repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}
