import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`captures and pans the canvas, repeat=${repeat}`, async ({ page, browserName }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const viewport = page.locator('[data-journal-document="today"] .edgeless-viewport');
    await viewport.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await page
      .getByRole("toolbar", { name: "Visual objects" })
      .getByRole("button", { name: "Pan", exact: true })
      .click();
    const bounds = (await viewport.boundingBox())!;
    const samples = [];
    for (let index = 0; index < 3; index++) {
      const before = await viewport.getAttribute("data-edgeless-pan-x");
      await page.mouse.move(bounds.x + bounds.width - 110, bounds.y + bounds.height - 100);
      await page.mouse.down();
      await viewport.evaluate((root) => {
        performance.clearMarks("pan-start");
        performance.clearMarks("pan-sync");
        performance.clearMarks("pan-rendered");
        root.addEventListener("pointermove", () => performance.mark("pan-start"), {
          capture: true,
          once: true,
        });
        root.addEventListener(
          "pointermove",
          () => {
            performance.mark("pan-sync");
            requestAnimationFrame(() =>
              requestAnimationFrame(() => performance.mark("pan-rendered")),
            );
          },
          { once: true },
        );
      });
      await page.mouse.move(bounds.x + bounds.width - 70, bounds.y + bounds.height - 80);
      await page.mouse.up();
      await expect.poll(() => viewport.getAttribute("data-edgeless-pan-x")).not.toBe(before);
      await page.waitForFunction(() => performance.getEntriesByName("pan-rendered").length > 0);
      samples.push(
        await page.evaluate(() => {
          const start = performance.getEntriesByName("pan-start")[0].startTime;
          return {
            sync: performance.getEntriesByName("pan-sync")[0].startTime - start,
            rendered: performance.getEntriesByName("pan-rendered")[0].startTime - start,
          };
        }),
      );
    }
    console.log(JSON.stringify({ browserName, repeat, samples }));
  });
}
