import { expect, test } from "@playwright/test";

test("selects an item with the marquee in the 10,000-element canvas", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  const viewport = page.getByRole("main", { name: "Independent canvas" });
  const bounds = (await viewport.boundingBox())!;
  const samples: { sync: number; frames: number }[] = [];
  for (let index = 0; index < 3; index++) {
    await page.mouse.move(bounds.x + 10, bounds.y + 10);
    await page.mouse.down();
    await viewport.evaluate((element) => {
      performance.clearMarks("marquee-start");
      performance.clearMarks("marquee-sync");
      performance.clearMarks("marquee-frames");
      element.addEventListener("pointermove", () => performance.mark("marquee-start"), {
        capture: true,
        once: true,
      });
      window.addEventListener(
        "pointermove",
        () => {
          performance.mark("marquee-sync");
          requestAnimationFrame(() =>
            requestAnimationFrame(() => performance.mark("marquee-frames")),
          );
        },
        { once: true },
      );
    });
    await page.mouse.move(bounds.x + 200, bounds.y + 150);
    await expect(page.locator('[data-canvas-controls-for="0"]')).toHaveCount(1);
    await page.waitForFunction(() => performance.getEntriesByName("marquee-frames").length > 0);
    samples.push(
      await page.evaluate(() => {
        const start = performance.getEntriesByName("marquee-start")[0].startTime;
        return {
          sync: performance.getEntriesByName("marquee-sync")[0].startTime - start,
          frames: performance.getEntriesByName("marquee-frames")[0].startTime - start,
        };
      }),
    );
    await page.mouse.up();
    await page.mouse.click(bounds.x + 10, bounds.y + 10);
    await expect(page.locator('[data-canvas-controls-for="0"]')).toHaveCount(0);
  }
  console.log(JSON.stringify({ browserName, elements: 10000, samples }));
});
