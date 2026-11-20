import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`starts toolbar preset capture, repeat=${repeat}`, async ({ page, browserName }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    const preset = toolbar.getByRole("button", { name: "Ellipse", exact: true });
    const area = (await page.locator(".edgeless-viewport").boundingBox())!;
    const shapes = page.locator('[data-edgeless-visual-kind="ellipse"]');
    const samples = [];
    for (let index = 0; index < 3; index++) {
      const before = await shapes.count();
      const button = (await preset.boundingBox())!;
      await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
      await page.evaluate(() => {
        performance.clearMarks("preset-start-down");
        performance.clearMarks("preset-start-sync");
        performance.clearMarks("preset-start-rendered");
        window.addEventListener("pointerdown", () => performance.mark("preset-start-down"), {
          capture: true,
          once: true,
        });
        window.addEventListener(
          "pointerdown",
          () => {
            performance.mark("preset-start-sync");
            requestAnimationFrame(() =>
              requestAnimationFrame(() => performance.mark("preset-start-rendered")),
            );
          },
          { once: true },
        );
      });
      await page.mouse.down();
      await page.waitForFunction(
        () => performance.getEntriesByName("preset-start-rendered").length > 0,
      );
      samples.push(
        await page.evaluate(() => {
          const start = performance.getEntriesByName("preset-start-down")[0].startTime;
          return {
            sync: performance.getEntriesByName("preset-start-sync")[0].startTime - start,
            rendered: performance.getEntriesByName("preset-start-rendered")[0].startTime - start,
          };
        }),
      );
      await page.mouse.move(area.x + 600 + index * 50, area.y + 400, { steps: 8 });
      await expect(page.locator(".edgeless-preset-ghost")).toBeVisible();
      await page.mouse.up();
      await expect(shapes).toHaveCount(before + 1);
    }
    console.log(JSON.stringify({ browserName, repeat, samples }));
  });
}
