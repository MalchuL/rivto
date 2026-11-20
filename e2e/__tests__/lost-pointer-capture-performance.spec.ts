import { expect, test, type Page } from "@playwright/test";
import type { ReactEditor } from "@chulane/rivto-react";

for (const repeat of [0, 200]) {
  test(`measures routed lost pointer capture, repeat=${repeat}`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const surface = page.locator('[data-journal-document="today"] > .page-surface');
    await surface.evaluate((root) => {
      const state = window as unknown as {
        __rivtoDemo: { reactEditor: ReactEditor };
        lostCaptureCount: number;
        hasPointerInput: boolean;
      };
      state.lostCaptureCount = 0;
      const button = document.createElement("button");
      button.textContent = "Capture measurement";
      button.dataset.editorControl = "";
      button.style.cssText = "position:absolute;top:0;left:0;z-index:9999";
      button.addEventListener("pointerdown", (event) => button.setPointerCapture(event.pointerId));
      root.prepend(button);
      state.__rivtoDemo.reactEditor.events.register(
        { id: "capture-measurement", type: "lostpointercapture", scope: "surface" },
        (event) => {
          state.lostCaptureCount += 1;
          state.hasPointerInput = event.pointerInput?.type === "lostpointercapture";
        },
      );
    });
    const button = surface.getByRole("button", { name: "Capture measurement" });
    const bounds = (await button.boundingBox())!;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await page.mouse.move(x, y);
      await armMeasurement(page);
      await page.mouse.down();
      await page.mouse.up();
      await page.mouse.move(x + 1, y);
      samples.push(await readMeasurement(page));
      expect(
        await page.evaluate(
          () => (window as unknown as { lostCaptureCount: number }).lostCaptureCount,
        ),
      ).toBe(index + 1);
      expect(
        await page.evaluate(
          () => (window as unknown as { hasPointerInput: boolean }).hasPointerInput,
        ),
      ).toBe(true);
    }
    console.log(
      JSON.stringify({ interaction: "lost-pointer-capture", browserName, repeat, samples }),
    );
  });
}

/**
 * Measures one routed lost-capture delivery from window capture through bubbling.
 *
 * @param page - Warm demo before a real pointer capture starts.
 * @returns Capture and bubble listeners are armed for one event.
 */
async function armMeasurement(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as unknown as { lostTiming: unknown };
    state.lostTiming = null;
    let start = 0;
    window.addEventListener("lostpointercapture", () => (start = performance.now()), {
      capture: true,
      once: true,
    });
    window.addEventListener(
      "lostpointercapture",
      () => {
        const sync = performance.now() - start;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            state.lostTiming = { sync, frames: performance.now() - start };
          });
        });
      },
      { once: true },
    );
  });
}

/**
 * Reads the completed event and two-frame measurement.
 *
 * @param page - Demo after pointer capture has been released.
 * @returns Synchronous and two-frame durations in milliseconds.
 */
async function readMeasurement(page: Page): Promise<unknown> {
  await page.waitForFunction(() => (window as unknown as { lostTiming: unknown }).lostTiming);
  return page.evaluate(() => (window as unknown as { lostTiming: unknown }).lostTiming);
}
