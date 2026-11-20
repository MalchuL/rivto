import { expect, test } from "@playwright/test";
import type { WrapperPointerTiming, WrapperPointerTimingWindow } from "./types";

for (const repeat of [1, 200]) {
  test(`routes nested wrapper pointer input at repeat=${repeat} @performance`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.getByRole("checkbox", { name: "Demo wrapper", exact: true }).check();
    await expect(page.locator("[data-demo-wrapper]")).toHaveCount(repeat * 6);
    const inner = page.locator('[data-demo-wrapper="child-0"]');
    const outer = page.locator('[data-demo-wrapper="block-1"]');
    const text = page.getByRole("textbox", { name: "Text child-0", exact: true });
    await text.click();
    const samples: WrapperPointerTiming[] = [];
    for (let index = 0; index < 3; index += 1) {
      await inner.evaluate((element) => element.removeAttribute("data-demo-wrapper-pointer"));
      await page.evaluate(() => {
        const state = window as unknown as WrapperPointerTimingWindow;
        state.wrapperPointerTiming = null;
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
                state.wrapperPointerTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      });
      await text.click();
      await expect(inner).toHaveAttribute("data-demo-wrapper-pointer", "true");
      await expect(outer).not.toHaveAttribute("data-demo-wrapper-pointer");
      await page.waitForFunction(
        () => (window as unknown as WrapperPointerTimingWindow).wrapperPointerTiming !== null,
      );
      const timing = await page.evaluate(
        () => (window as unknown as WrapperPointerTimingWindow).wrapperPointerTiming,
      );
      if (!timing) {
        throw new Error("Expected completed wrapper pointer timing");
      }
      samples.push(timing);
    }
    console.log(`wrapper pointer repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}
