import { expect, test, type Locator } from "@playwright/test";
import { ROOT_BLOCK_SELECTOR } from "../dom-markers";

for (const repeat of [0, 200]) {
  test(`updates bullet threading after focus, repeat=${repeat}`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const parent = page
      .locator(
        `[data-journal-document='today'] > .page-surface ${ROOT_BLOCK_SELECTOR}:has(> .rivto-block-children)`,
      )
      .first();
    const parentContent = parent.locator(":scope > .rivto-block-row [data-block-content]");
    const childContent = parent
      .locator(":scope > .rivto-block-children > .rivto-block")
      .first()
      .locator(":scope > .rivto-block-row [data-block-content]");
    await parentContent.click();
    const path = page.locator("[data-bullet-threading] path:not([d=''])");
    await expect(path).toHaveCount(1);
    const samples = [];
    for (let index = 0; index < 4; index++) {
      samples.push(await measureFocus(index % 2 ? parentContent : childContent));
      await expect(path).toHaveCount(1);
    }
    console.log(
      JSON.stringify({
        interaction: "bullet-threading-focus",
        browserName,
        repeat,
        samples: samples.slice(1),
      }),
    );
  });
}

/**
 * Focuses one rendered block and measures synchronous work and two frames.
 *
 * @param content - Editable content belonging to the target block.
 * @returns Focus duration and time through the second animation frame in milliseconds.
 */
async function measureFocus(content: Locator) {
  return content.evaluate(async (element: HTMLElement) => {
    const start = performance.now();
    element.focus();
    const sync = performance.now() - start;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return { sync, rendered: performance.now() - start };
  });
}
