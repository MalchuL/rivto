import { expect, test, type Page } from "@playwright/test";

/**
 * Measures a view visibility click and the following two animation frames.
 *
 * @param page - Warm independent canvas demo.
 * @param label - Accessible name of the visibility button to click.
 * @returns Synchronous event delivery and two-frame durations in milliseconds.
 */
async function measureVisibility(page: Page, label: "Hide canvas" | "Show canvas") {
  await page.evaluate(() => {
    performance.clearMarks("visibility-start");
    performance.clearMarks("visibility-sync");
    performance.clearMarks("visibility-rendered");
    window.addEventListener("click", () => performance.mark("visibility-start"), {
      capture: true,
      once: true,
    });
    window.addEventListener(
      "click",
      () => {
        performance.mark("visibility-sync");
        requestAnimationFrame(() =>
          requestAnimationFrame(() => performance.mark("visibility-rendered")),
        );
      },
      { once: true },
    );
  });
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForFunction(() => performance.getEntriesByName("visibility-rendered").length > 0);
  return page.evaluate(() => {
    const start = performance.getEntriesByName("visibility-start")[0].startTime;
    return {
      sync: performance.getEntriesByName("visibility-sync")[0].startTime - start,
      rendered: performance.getEntriesByName("visibility-rendered")[0].startTime - start,
    };
  });
}

test("attachment status follows repeated hide and remount with 10000 source items", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Canvas attachment")).toHaveText("mounted");
  const samples = [];
  for (let index = 0; index < 3; index++) {
    const hide = await measureVisibility(page, "Hide canvas");
    await expect(page.getByLabel("Canvas attachment")).toHaveText("detached");
    const show = await measureVisibility(page, "Show canvas");
    await expect(page.getByLabel("Canvas attachment")).toHaveText("mounted");
    await expect(page.locator('[data-canvas-element="0"]')).toBeVisible();
    samples.push({ hide, show });
  }
  console.log(`canvas attachment: ${JSON.stringify(samples)}`);
});
