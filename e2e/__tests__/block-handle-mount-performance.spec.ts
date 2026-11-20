import { expect, test } from "@playwright/test";
import type { BlockHandleMountTiming } from "./types";

for (const repeat of [0, 200]) {
  test(`mounts Page block handles at repeat=${repeat}`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    const samples: BlockHandleMountTiming[] = [];
    // The seeded document has 60 handles and adds 15 for each repeated branch.
    const expectedHandles = 60 + 15 * repeat;
    for (let index = 0; index < 4; index += 1) {
      await page.goto(`/?repeat=${repeat}`);
      await page.waitForFunction(
        (expected) => {
          const handles = document.querySelectorAll(
            '[data-journal-document="today"] > .page-surface .block-handle',
          );
          return handles.length === expected;
        },
        expectedHandles,
      );
      const timing = await page.evaluate(async () => {
        const handles = document.querySelectorAll(
          '[data-journal-document="today"] > .page-surface .block-handle',
        ).length;
        const mounted = performance.now();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return { mounted, frames: performance.now(), handles };
      });
      expect(timing.handles).toBe(expectedHandles);
      if (index > 0) {
        samples.push(timing);
      }
    }
    console.log(
      JSON.stringify({ interaction: "block-handle-mount", browserName, repeat, samples }),
    );
  });
}
