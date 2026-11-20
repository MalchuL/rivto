import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`page focus from outside the editor, repeat=${repeat}`, async ({ page, browserName }) => {
    await page.goto(`/?repeat=${repeat}`);
    const content = page
      .locator('[data-journal-document="today"] [data-block-content][contenteditable]')
      .first();
    await expect(content).toBeVisible();
    const outside = page.locator("button").first();
    const samples: Array<{ sync: number; rendered: number }> = [];
    for (let index = 0; index < 3; index += 1) {
      await outside.focus();
      await page.evaluate(() => {
        performance.clearMarks("page-focus-start");
        performance.clearMarks("page-focus-sync");
        performance.clearMarks("page-focus-rendered");
        document.addEventListener("focusin", () => performance.mark("page-focus-start"), {
          capture: true,
          once: true,
        });
        window.addEventListener(
          "focusin",
          () => {
            performance.mark("page-focus-sync");
            requestAnimationFrame(() =>
              requestAnimationFrame(() => performance.mark("page-focus-rendered")),
            );
          },
          { once: true },
        );
      });
      await content.click();
      await expect(content).toBeFocused();
      await page.waitForFunction(
        () => performance.getEntriesByName("page-focus-rendered").length > 0,
      );
      samples.push(
        await page.evaluate(() => {
          const start = performance.getEntriesByName("page-focus-start")[0].startTime;
          return {
            sync: performance.getEntriesByName("page-focus-sync")[0].startTime - start,
            rendered: performance.getEntriesByName("page-focus-rendered")[0].startTime - start,
          };
        }),
      );
    }
    console.log(JSON.stringify({ browserName, repeat, samples }));
  });
}
