import { expect, test, type Locator, type Page } from "@playwright/test";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`adds and focuses Kanban blocks in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      await page.evaluate(() => {
        const blocks = window.__rivtoDemo.editor.blocks;
        blocks.insertBlock(
          {
            id: "kanban-focus-perf-board",
            type: "kanban",
            children: [
              { id: "kanban-focus-perf-lane", type: "kanban-column", content: "Test lane" },
            ],
          },
          { parentId: null, beforeId: blocks.getRootIds()[0] },
        );
      });
      if (mode === "edgeless") {
        await page.evaluate(() => {
          const editor = window.__rivtoDemo.editor;
          editor.elements.insertElement({
            type: "block",
            frame: { x: 60, y: 60, width: 600, height: 360 },
            zIndex: 100000,
            props: {
              startBlockId: "kanban-focus-perf-board",
              endBlockId: "kanban-focus-perf-board",
            },
          });
        });
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const board = page.locator('[data-block-id="kanban-focus-perf-board"]:visible').first();
      const lane = board.locator('[data-block-id="kanban-focus-perf-lane"]');
      await expect(board).toBeVisible();
      const samples: Array<{ column: unknown; card: unknown }> = [];
      for (let index = 0; index < 3; index += 1) {
        const column = await measureClick(
          page,
          board.getByRole("button", { name: "Add Kanban column" }),
        );
        const columnId = await page.evaluate(() =>
          window.__rivtoDemo.editor.blocks.getChildIds("kanban-focus-perf-board").at(-1)!,
        );
        await expect(
          board.locator(`[data-block-id="${columnId}"] [data-block-content]`).first(),
        ).toBeFocused();
        const card = await measureClick(
          page,
          lane.getByRole("button", { name: "Add card to Test lane" }),
        );
        const cardId = await page.evaluate(() =>
          window.__rivtoDemo.editor.blocks.getChildIds("kanban-focus-perf-lane").at(-1)!,
        );
        await expect(
          lane.locator(`[data-block-id="${cardId}"] [data-block-content]`).first(),
        ).toBeFocused();
        samples.push({ column, card });
        await page.evaluate(
          ({ columnId, cardId }) =>
            window.__rivtoDemo.editor.blocks.removeBlocks([columnId, cardId]),
          { columnId, cardId },
        );
      }
      console.log(JSON.stringify({ interaction: "kanban-add-focus", mode, repeat, samples }));
    });
  }
}

/**
 * Measures a real button click through synchronous delivery and two frames.
 *
 * @param page - Warm editor containing the button.
 * @param button - Accessible add control to activate.
 * @returns Synchronous and two-frame durations in milliseconds.
 */
async function measureClick(page: Page, button: Locator) {
  await page.evaluate(() => {
    const state = window as unknown as { kanbanFocusTiming: unknown };
    state.kanbanFocusTiming = null;
    window.addEventListener(
      "click",
      () => {
        const start = performance.now();
        window.addEventListener(
          "click",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.kanbanFocusTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await button.click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { kanbanFocusTiming: unknown }).kanbanFocusTiming),
    )
    .not.toBeNull();
  return page.evaluate(
    () => (window as unknown as { kanbanFocusTiming: unknown }).kanbanFocusTiming,
  );
}
