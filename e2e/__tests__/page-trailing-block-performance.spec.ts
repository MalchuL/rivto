import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`page trailing block creates and focuses a block, repeat=${repeat}`, async ({
    page,
    browserName,
  }) => {
    await page.goto(`/?repeat=${repeat}`);
    const editor = page.locator('[data-journal-document="today"] > .page-surface');
    const button = editor.getByRole("button", { name: "Add block", exact: true });
    await expect(button).toBeVisible();
    const originalIds = await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getRootIds(),
    );
    await page.evaluate(() => {
      document.addEventListener("click", () => performance.mark("trailing-start"), {
        capture: true,
        once: true,
      });
      window.addEventListener("click", () => performance.mark("trailing-sync"), { once: true });
      const onFocus = (event: FocusEvent) => {
        if (event.target instanceof Element && event.target.matches("[data-block-content]")) {
          document.removeEventListener("focusin", onFocus, true);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => performance.mark("trailing-rendered")),
          );
        }
      };
      document.addEventListener("focusin", onFocus, true);
    });
    await button.click();
    const createdId = await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks
        .getRootIds()
        .at(-1),
    );
    expect(createdId).toBeTruthy();
    expect(originalIds).not.toContain(createdId);
    await expect(
      editor.locator(`[data-block-id="${createdId}"] [data-block-content]`).first(),
    ).toBeFocused();
    await expect(
      editor.locator(`[data-block-id="${createdId}"] [data-block-content]`).first(),
    ).toBeInViewport();
    await page.waitForFunction(() => performance.getEntriesByName("trailing-rendered").length > 0);
    const sample = await page.evaluate(() => {
      const start = performance.getEntriesByName("trailing-start")[0].startTime;
      return {
        sync: performance.getEntriesByName("trailing-sync")[0].startTime - start,
        rendered: performance.getEntriesByName("trailing-rendered")[0].startTime - start,
      };
    });
    console.log(JSON.stringify({ browserName, repeat, sample }));
  });
}
