import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Browser-local measurements of the real selection command and subsequent paint frames. */
interface MarqueeMeasurements {
  readonly sync: number[];
  readonly rendered: number[];
}

/** Demo instrumentation retained only for one browser test. */
interface MeasuredWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
  __marqueeMeasurements: MarqueeMeasurements;
}

/** Owns fixture setup and browser instrumentation outside interaction timing. */
class MarqueePerformanceFixture {
  /**
   * Borrows one browser page for the duration of a measurement test.
   *
   * @param page - Dedicated production preview page.
   */
  constructor(private readonly page: Page) {}

  /**
   * Opens the default demo and finds an empty start beside its first two cards.
   *
   * @param repeat - Number of additional demo cards; zero retains normal defaults.
   * @returns Client endpoints for selecting the same two visible cards.
   */
  async prepare(repeat: number) {
    const page = this.page;
    await page.goto(repeat ? `/?repeat=${repeat}` : "/");
    await page.locator('[data-editor-mode="edgeless"]').click();
    const viewport = page.locator(".edgeless-viewport");
    await viewport.evaluate((root) => root.scrollIntoView({ block: "start" }));
    const cards = page.locator("[data-edgeless-root]");
    await expect(cards.nth(1)).toBeVisible();
    const first = (await cards.nth(0).boundingBox())!;
    const second = (await cards.nth(1).boundingBox())!;
    const start = await viewport.evaluate(
      (root, x) => {
        const bounds = root.getBoundingClientRect();
        for (let y = bounds.bottom - 100; y > bounds.top + 100; y -= 40) {
          const hit = document.elementFromPoint(x, y);
          if (
            hit &&
            root.contains(hit) &&
            !hit.closest("[data-edgeless-object-kind], [data-edgeless-ui]")
          ) {
            return { x, y };
          }
        }
        throw new Error("No empty canvas point beside the second card");
      },
      second.x + second.width + 20,
    );
    return { start, end: { x: first.x - 1, y: first.y - 5 } };
  }

  /**
   * Measures synchronous selection writes and pointer-to-two-frame completion separately.
   *
   * @returns Instrumentation is installed on this test's page and discarded with that page.
   */
  async instrument(): Promise<void> {
    const page = this.page;
    await page.evaluate(() => {
      const win = window as unknown as MeasuredWindow;
      const measurements: MarqueeMeasurements = { sync: [], rendered: [] };
      win.__marqueeMeasurements = measurements;
      const selection = win.__rivtoDemo.editor.selection;
      const set = selection.set.bind(selection);
      selection.set = (...args) => {
        const start = performance.now();
        try {
          return set(...args);
        } finally {
          measurements.sync.push(performance.now() - start);
        }
      };
      window.addEventListener(
        "pointermove",
        (event) => {
          if (!(event.buttons & 1)) {
            return;
          }
          const start = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => measurements.rendered.push(performance.now() - start)),
          );
        },
        true,
      );
    });
  }
}

for (const repeat of [0, 200]) {
  test(`marquee command and rendering at repeat=${repeat}`, async ({ page }) => {
    const fixture = new MarqueePerformanceFixture(page);
    const { start, end } = await fixture.prepare(repeat);
    await fixture.instrument();
    const samples: MarqueeMeasurements[] = [];
    for (let sample = 0; sample < 4; sample += 1) {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.evaluate(() => {
        const measurements = (window as unknown as MeasuredWindow).__marqueeMeasurements;
        measurements.sync.length = 0;
        measurements.rendered.length = 0;
      });
      await page.mouse.move(end.x, end.y);
      await expect(page.locator("[data-edgeless-root][data-block-selected]")).toHaveCount(2);
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as unknown as MeasuredWindow).__marqueeMeasurements.rendered.length,
          ),
        )
        .toBeGreaterThan(0);
      const result = await page.evaluate(
        () => (window as unknown as MeasuredWindow).__marqueeMeasurements,
      );
      expect(result.sync.length).toBeGreaterThan(0);
      if (sample) {
        samples.push(result);
      }
      await page.mouse.up();
      await expect(page.locator("[data-edgeless-selection-rectangle]")).toBeHidden();
    }
    console.log(`marquee repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}
