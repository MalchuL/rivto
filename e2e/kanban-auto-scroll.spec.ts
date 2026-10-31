import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Prepends a wide native board while retaining the production demo and its subscribers.
 *
 * @param page - Browser page owning the fixture and pointer.
 * @param repeat - Extra demo content for normal and large-document checks.
 * @param mode - Surface rendering the same canonical board.
 * @returns Resolves when the board is centered and its initial card is mounted.
 */
async function loadBoard(page: Page, repeat: number, mode: "block" | "edgeless"): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto(`/?test_features=1&repeat=${repeat}`);
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.blocks.insertBlock(
      {
        id: "scroll-board",
        type: "kanban",
        content: "Scrolling board",
        children: Array.from({ length: 8 }, (_, index) => ({
          id: `scroll-lane-${index}`,
          type: "kanban-column",
          content: `Lane ${index}`,
          children:
            index === 0 ? [{ id: "scroll-card", type: "paragraph", content: "Moving card" }] : [],
        })),
      },
      { parentId: null, beforeId: editor.blocks.getRootIds()[0] },
    );
    editor.history.clear();
  });
  if (mode === "edgeless") {
    await page.locator('[data-editor-mode="edgeless"]').click();
  }
  await page
    .locator('[data-block-id="scroll-board"]')
    .evaluate((element) => element.scrollIntoView({ block: "center", inline: "center" }));
}

for (const repeat of [0, 200]) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`scrolls Kanban in both directions during native drag on ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      await loadBoard(page, repeat, mode);
      const board = page.locator('[data-block-id="scroll-board"] > .rivto-kanban-columns');
      const row = page.locator('[data-block-id="scroll-card"] > .rivto-block-row');
      await row.hover();
      const handle = row.locator(".block-handle");
      await handle.hover();
      const source = (await handle.boundingBox())!;
      const bounds = (await board.boundingBox())!;
      const y = bounds.y + bounds.height / 2;
      const pageScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(source.x + source.width / 2 + 8, source.y + source.height / 2);
      await expect(page.locator(".rivto-block-drag-preview")).toBeVisible();
      await page.mouse.move(bounds.x + bounds.width - 6, y, { steps: 5 });
      await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(150);
      // The held cursor must keep scrolling without additional pointermove events.
      const advanced = await board.evaluate((element) => element.scrollLeft);
      await expect
        .poll(() => board.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(advanced + 100);
      await page.mouse.move(bounds.x + 6, y, { steps: 5 });
      await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBe(0);
      await page.mouse.move(bounds.x + bounds.width - 6, y, { steps: 5 });
      await expect
        .poll(
          () =>
            board.evaluate(
              (element) => element.scrollWidth - element.clientWidth - element.scrollLeft,
            ),
          { timeout: 10_000 },
        )
        .toBeLessThan(1);
      const destination = page.locator('[data-block-id="scroll-lane-7"]');
      const header = (await destination.locator(":scope > .rivto-block-row").boundingBox())!;
      await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
      await expect(destination).toHaveAttribute("data-block-drop-active", "true");
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId("scroll-card"),
          ),
        )
        .toBe("scroll-lane-7");
      await expect(page.locator(".rivto-block-drag-preview")).toHaveCount(0);
      const stopped = await board.evaluate((element) => element.scrollLeft);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(await board.evaluate((element) => element.scrollLeft)).toBe(stopped);
      expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(pageScroll);
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId("scroll-card"),
          ),
        )
        .toBe("scroll-lane-0");
    });
  }
}
