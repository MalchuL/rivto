import { expect, test } from "@playwright/test";

test("measures creation preview on the independent canvas", async ({ page, browserName }) => {
  await page.goto("/");
  await page
    .getByRole("toolbar", { name: "Canvas tools" })
    .getByRole("button", { name: "Shapes", exact: true })
    .click();
  const viewport = (await page.getByRole("main", { name: "Independent canvas" }).boundingBox())!;
  const samples: Array<{ sync: number; rendered: number }> = [];
  for (let index = 0; index < 3; index++) {
    await page.mouse.move(viewport.x + 650, viewport.y + 180);
    await page.mouse.down();
    await page.evaluate(() => {
      performance.clearMarks();
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
    await page.mouse.move(viewport.x + 740, viewport.y + 250);
    await expect(page.locator("[data-demo-creation-preview]")).toBeVisible();
    await page.waitForFunction(() => performance.getEntriesByName("tool-rendered").length > 0);
    samples.push(
      await page.evaluate(() => {
        const start = performance.getEntriesByName("tool-start")[0]!.startTime;
        return {
          sync: performance.getEntriesByName("tool-sync")[0]!.startTime - start,
          rendered: performance.getEntriesByName("tool-rendered")[0]!.startTime - start,
        };
      }),
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator("[data-demo-creation-preview]")).toHaveCount(0);
  }
  console.log(JSON.stringify({ browserName, elements: 10000, samples }));
});
