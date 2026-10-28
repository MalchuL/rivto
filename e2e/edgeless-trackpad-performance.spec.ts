import { expect, test, type Page, type Locator } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface WheelSample {
  start: number;
  sync: number;
  paint: number;
}

interface TrackpadInspection extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
  trackpadLoading: {
    samples: WheelSample[];
    heightWrites: number;
    heightBatches: number[];
    targetScans: number;
    viewportReads: number;
  };
}

/**
 * Records native wheel work and the number of height writes in each excluded-history batch.
 *
 * Instrumentation adds counters to the public command path without reading the
 * document forest during input. The test page owns these wrappers until teardown.
 *
 * @param page - Warm demo whose edgeless canvas is already mounted.
 * @returns Resolves after timing listeners and command counters are installed.
 * @throws If the demo is unavailable or browser evaluation fails.
 */
async function recordTrackpadLoading(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as TrackpadInspection;
    const stats = {
      samples: [] as WheelSample[],
      heightWrites: 0,
      heightBatches: [] as number[],
      targetScans: 0,
      viewportReads: 0,
    };
    state.trackpadLoading = stats;
    const { editor } = state.__rivtoDemo;
    const update = editor.elements.updateElements.bind(editor.elements);
    editor.elements.updateElements = (updates) => {
      stats.heightWrites += updates.filter(({ patch }) => patch.frame?.height !== undefined).length;
      return update(updates);
    };
    const batch = editor.history.batchUpdatesWithoutHistory.bind(editor.history);
    editor.history.batchUpdatesWithoutHistory = (operation) => {
      const before = stats.heightWrites;
      const result = batch(operation);
      stats.heightBatches.push(stats.heightWrites - before);
      return result;
    };
    window.addEventListener(
      "wheel",
      () => {
        const sample = { start: performance.now(), sync: 0, paint: 0 };
        stats.samples.push(sample);
        window.addEventListener(
          "wheel",
          () => {
            sample.sync = performance.now() - sample.start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                sample.paint = performance.now() - sample.start;
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true },
    );
  });
}

/**
 * Counts whole-plane target scans while scrolling with no selected objects.
 *
 * @param page - Warm demo whose timing counters have already been installed.
 * @returns Resolves after installing a wrapper on this canvas plane's query method.
 * @throws If no mounted canvas plane exists or browser evaluation fails.
 */
async function recordEmptyControlScans(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as TrackpadInspection;
    const plane = document.querySelector<HTMLElement>(".edgeless-plane")!;
    const root = plane.parentElement!;
    const measure = root.getBoundingClientRect.bind(root);
    Object.defineProperty(root, "getBoundingClientRect", {
      configurable: true,
      /**
       * Forwards viewport measurements and counts forced client-origin reads.
       *
       * @returns The native viewport rectangle in client coordinates.
       */
      value() {
        state.trackpadLoading.viewportReads++;
        return measure();
      },
    });
    const query = plane.querySelectorAll.bind(plane);
    Object.defineProperty(plane, "querySelectorAll", {
      configurable: true,
      /**
       * Forwards scoped DOM queries while counting transform-target collection reads.
       *
       * @param selector - Original DOM selector supplied by canvas controls.
       * @returns Matching descendants in the same order as the native query.
       * @throws If the selector is invalid, matching the native query's behavior.
       */
      value(selector: string) {
        if (
          selector.includes("data-canvas-element") ||
          selector.includes("data-edgeless-object-kind")
        ) {
          state.trackpadLoading.targetScans++;
        }
        return query(selector);
      },
    });
  });
}

/**
 * Pans horizontally with 25 native trackpad samples delivered across animation frames.
 *
 * @param page - Demo browser receiving native wheel input.
 * @param delta - Horizontal displacement per sample in CSS pixels; negative reverses direction.
 * @returns Resolves after delivering every sample and its following frame callback.
 * @throws If native wheel delivery or animation-frame evaluation fails.
 */
async function panWithTrackpad(page: Page, delta: number): Promise<void> {
  for (let index = 0; index < 25; index++) {
    await page.mouse.wheel(delta, 0);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }
}

/**
 * Checks camera-only input without conflating viewport entry with camera translation.
 *
 * Recycling content under a stationary pointer can replay React's pointer-entry
 * handler and legitimately measure the origin. Move outside before this separate
 * DOM wheel probe so only camera-driven layout reads can reach the counter.
 * The preceding native-wheel sweep still covers real input and mounting cost.
 *
 * @param page - Warm browser after the native trackpad sweep has returned to the origin.
 * @param canvas - Canvas receiving pixel wheel events while the pointer is outside it.
 * @returns Resolves after checking no viewport read and restoring the original camera.
 * @throws If input, camera restoration or the layout-read assertion fails.
 */
async function assertCameraSkipsViewportLayout(page: Page, canvas: Locator): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.evaluate(() => {
    (window as TrackpadInspection).trackpadLoading.viewportReads = 0;
  });
  await canvas.dispatchEvent("wheel", { deltaX: 12, deltaMode: 0 });
  await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "-12");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(
    await page.evaluate(() => (window as TrackpadInspection).trackpadLoading.viewportReads),
  ).toBe(0);
  await canvas.dispatchEvent("wheel", { deltaX: -12, deltaMode: 0 });
  await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "0");
}

/**
 * Summarizes equivalent wheel samples without imposing an uncalibrated timing limit.
 *
 * @param values - Nonempty handler or two-frame durations in milliseconds.
 * @returns Median and observed minimum/maximum, rounded to one decimal place.
 */
function timingRange(values: readonly number[]): { median: number; min: number; max: number } {
  const sorted = [...values].sort((left, right) => left - right);
  /**
   * Rounds one measured duration to a tenth of a millisecond for logging.
   *
   * @param value - Measured duration in milliseconds.
   * @returns The duration rounded to one decimal place.
   */
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    median: round(sorted[Math.floor(sorted.length / 2)]!),
    min: round(sorted[0]!),
    max: round(sorted.at(-1)!),
  };
}

for (const repeat of [0, 200]) {
  test(`trackpad scrolling loads cards with batched height writes, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').first().click();
    const canvas = page.locator(".edgeless-viewport").first();
    await expect(canvas.locator("[data-edgeless-root]").first()).toBeVisible();
    await canvas.hover({ position: { x: 24, y: 24 } });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const initial = await canvas
      .locator("[data-edgeless-root]")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-edgeless-root")));
    await recordTrackpadLoading(page);
    await recordEmptyControlScans(page);
    await panWithTrackpad(page, 72);
    await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "-1800");
    const advanced = await canvas
      .locator("[data-edgeless-root]")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-edgeless-root")));
    await panWithTrackpad(page, -72);
    await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "0");
    await expect(canvas).toHaveAttribute("data-edgeless-zoom", "1");
    const returned = await canvas
      .locator("[data-edgeless-root]")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-edgeless-root")));
    expect(returned).toEqual(expect.arrayContaining(initial));
    const stats = await page.evaluate(() => (window as TrackpadInspection).trackpadLoading);
    const samples = stats.samples.filter((sample) => sample.paint > 0);
    expect(samples.length).toBeGreaterThan(10);
    console.log(
      `trackpad loading repeat=${repeat}: ${JSON.stringify({ sync: timingRange(samples.map((sample) => sample.sync)), paint: timingRange(samples.map((sample) => sample.paint)), heightBatches: stats.heightBatches })}`,
    );
    expect(stats.targetScans).toBe(0);
    await assertCameraSkipsViewportLayout(page, canvas);
    if (repeat > 0) {
      expect(advanced.some((id) => !initial.includes(id))).toBe(true);
      expect(stats.heightWrites).toBeGreaterThan(1);
      expect(stats.heightBatches.some((count) => count > 1)).toBe(true);
    }
  });
}
