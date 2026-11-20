import { expect, test, type Page } from "@playwright/test";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ROW_SELECTOR,
  ROOT_BLOCK_SELECTOR,
  hostBlockIdSelector,
} from "../dom-markers";

for (const repeat of [0, 200]) {
  test(`removes an empty block after a separator with Backspace, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const roots = page.locator(`.page-surface ${ROOT_BLOCK_SELECTOR}`);
    await roots.first().locator("[data-block-content]").first().click();
    await page.keyboard.press("Control+Shift+Enter");
    const separatorId = await roots.nth(1).getAttribute(BLOCK_ID_ATTRIBUTE);
    const writingId = await roots.nth(2).getAttribute(BLOCK_ID_ATTRIBUTE);
    expect(separatorId).toBeTruthy();
    expect(writingId).toBeTruthy();
    const separator = page.locator(hostBlockIdSelector(separatorId!));
    const writing = page.locator(hostBlockIdSelector(writingId!));
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      const content = writing.locator(`:scope > ${BLOCK_ROW_SELECTOR} [data-block-content]`);
      await content.click();
      samples.push(await measureBackspace(page));
      await expect(writing).toHaveCount(0);
      await expect(separator).toHaveAttribute("data-block-selected", "true");
      await page.keyboard.press("ControlOrMeta+z");
      await expect(writing).toBeVisible();
    }
    console.log(JSON.stringify({ interaction: "structural-predecessor", repeat, samples }));
  });
}

/**
 * Measures one real Backspace delivery and the subsequent two browser frames.
 *
 * @param page - Warm editor with its empty continuation focused.
 * @returns Synchronous and two-frame durations in milliseconds.
 */
async function measureBackspace(page: Page) {
  await page.evaluate(() => {
    for (const name of ["predecessor-start", "predecessor-sync", "predecessor-frames"]) {
      performance.clearMarks(name);
    }
    const start = (event: KeyboardEvent) => {
      if (event.key === "Backspace") {
        window.removeEventListener("keydown", start, true);
        performance.mark("predecessor-start");
      }
    };
    const finish = (event: KeyboardEvent) => {
      if (event.key === "Backspace") {
        window.removeEventListener("keydown", finish);
        performance.mark("predecessor-sync");
        requestAnimationFrame(() =>
          requestAnimationFrame(() => performance.mark("predecessor-frames")),
        );
      }
    };
    window.addEventListener("keydown", start, true);
    window.addEventListener("keydown", finish);
  });
  await page.keyboard.press("Backspace");
  await page.waitForFunction(() => performance.getEntriesByName("predecessor-frames").length > 0);
  return page.evaluate(() => {
    const start = performance.getEntriesByName("predecessor-start")[0].startTime;
    return {
      sync: performance.getEntriesByName("predecessor-sync")[0].startTime - start,
      frames: performance.getEntriesByName("predecessor-frames")[0].startTime - start,
    };
  });
}
