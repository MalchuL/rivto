import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`draws through the tool capture, repeat=${repeat}`, async ({ page, browserName }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Drawing", exact: true }).click();
    await page
      .getByRole("dialog", { name: "drawing tools" })
      .getByRole("button", { name: "Pen", exact: true })
      .click();
    const canvas = page.locator(".edgeless-viewport");
    const bounds = (await canvas.boundingBox())!;
    const drawings = canvas.locator('[data-edgeless-visual-kind="drawing"]');
    const samples = [];
    for (let index = 0; index < 3; index++) {
      const before = await drawings.count();
      await page.mouse.move(bounds.x + 450, bounds.y + 300);
      await page.mouse.down();
      await page.evaluate(() => {
        performance.clearMarks("tool-start");
        performance.clearMarks("tool-sync");
        performance.clearMarks("tool-rendered");
        window.addEventListener("pointermove", () => performance.mark("tool-start"), {
          capture: true,
          once: true,
        });
        window.addEventListener(
          "pointermove",
          () => {
            performance.mark("tool-sync");
            requestAnimationFrame(() =>
              requestAnimationFrame(() => performance.mark("tool-rendered")),
            );
          },
          { once: true },
        );
      });
      await page.mouse.move(bounds.x + 490, bounds.y + 340);
      await page.waitForFunction(() => performance.getEntriesByName("tool-rendered").length > 0);
      samples.push(
        await page.evaluate(() => {
          const start = performance.getEntriesByName("tool-start")[0].startTime;
          return {
            sync: performance.getEntriesByName("tool-sync")[0].startTime - start,
            rendered: performance.getEntriesByName("tool-rendered")[0].startTime - start,
          };
        }),
      );
      await page.mouse.move(bounds.x + 530, bounds.y + 300);
      await page.mouse.up();
      await expect(drawings).toHaveCount(before + 1);
    }
    console.log(JSON.stringify({ browserName, repeat, samples }));
  });
}
