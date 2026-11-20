import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`activates a toolbar preset by click, repeat=${repeat}`, async ({ page, browserName }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    const preset = toolbar.getByRole("button", { name: "Ellipse", exact: true });
    const capture = page.locator(".edgeless-drawing-capture[data-active]");
    const shapes = page.locator('[data-edgeless-visual-kind="ellipse"]');
    const samples = [];
    for (let index = 0; index < 3; index++) {
      const before = await shapes.count();
      const button = (await preset.boundingBox())!;
      await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
      await page.evaluate(() => {
        performance.clearMarks("preset-click-start");
        performance.clearMarks("preset-click-sync");
        performance.clearMarks("preset-click-rendered");
        window.addEventListener("click", () => performance.mark("preset-click-start"), {
          capture: true,
          once: true,
        });
        window.addEventListener(
          "click",
          () => {
            performance.mark("preset-click-sync");
            requestAnimationFrame(() =>
              requestAnimationFrame(() => performance.mark("preset-click-rendered")),
            );
          },
          { once: true },
        );
      });
      await page.mouse.down();
      await page.mouse.up();
      await expect(capture).toBeVisible();
      await expect(shapes).toHaveCount(before);
      await page.waitForFunction(
        () => performance.getEntriesByName("preset-click-rendered").length > 0,
      );
      samples.push(
        await page.evaluate(() => {
          const start = performance.getEntriesByName("preset-click-start")[0].startTime;
          return {
            sync: performance.getEntriesByName("preset-click-sync")[0].startTime - start,
            rendered: performance.getEntriesByName("preset-click-rendered")[0].startTime - start,
          };
        }),
      );
    }
    console.log(JSON.stringify({ browserName, repeat, samples }));
  });
}
