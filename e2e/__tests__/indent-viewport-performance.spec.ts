import { expect, test, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`preserves selection through indent and outdent, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    const [parentId, blockId] = await page.evaluate(() =>
      window.__rivtoDemo.editor.blocks.getRootIds().slice(0, 2),
    );
    const content = page.locator(`[data-block-id="${blockId}"] [data-block-content]`).first();
    await content.click();
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      const indent = await measureKey(page, "Tab");
      await expect
        .poll(() =>
          page.evaluate((id) => window.__rivtoDemo.editor.blocks.getParentId(id), blockId),
        )
        .toBe(parentId);
      const outdent = await measureKey(page, "Shift+Tab");
      await expect
        .poll(() =>
          page.evaluate(
            (id) => window.__rivtoDemo.editor.blocks.getRootIds().includes(id),
            blockId,
          ),
        )
        .toBe(true);
      await expect
        .poll(() => page.evaluate(() => window.__rivtoDemo.editor.selection.get()?.focusBlockId))
        .toBe(blockId);
      samples.push({ indent, outdent });
    }
    console.log(JSON.stringify({ interaction: "indent-viewport", repeat, samples }));
  });
}

/**
 * Measures a real keyboard command through synchronous delivery and two frames.
 *
 * @param page - Warm editor with a caret in the selected block.
 * @param key - Indent or outdent shortcut.
 * @returns Synchronous and two-frame durations in milliseconds.
 */
async function measureKey(page: Page, key: string) {
  await page.evaluate(() => {
    performance.clearMarks("indent-start");
    performance.clearMarks("indent-sync");
    performance.clearMarks("indent-rendered");
    const start = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      window.removeEventListener("keydown", start, true);
      performance.mark("indent-start");
    };
    const finish = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }
      window.removeEventListener("keydown", finish);
      performance.mark("indent-sync");
      requestAnimationFrame(() => requestAnimationFrame(() => performance.mark("indent-rendered")));
    };
    window.addEventListener("keydown", start, true);
    window.addEventListener("keydown", finish);
  });
  await page.keyboard.press(key);
  await page.waitForFunction(() => performance.getEntriesByName("indent-rendered").length > 0);
  return page.evaluate(() => {
    const start = performance.getEntriesByName("indent-start")[0].startTime;
    return {
      sync: performance.getEntriesByName("indent-sync")[0].startTime - start,
      frames: performance.getEntriesByName("indent-rendered")[0].startTime - start,
    };
  });
}
