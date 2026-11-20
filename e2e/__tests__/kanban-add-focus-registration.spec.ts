import { expect, test } from "@playwright/test";

test("does not focus a new column through a replaced panel registration", async ({ page }) => {
  await page.goto("/");
  const board = page.locator('[data-journal-document="today"] [data-block-type="kanban"]').first();
  await expect(board).toBeVisible();
  const boardId = (await board.getAttribute("data-block-id"))!;
  await board.getByRole("button", { name: "Add Kanban column" }).evaluate((button) => {
    const state = window as unknown as {
      kanbanFocusFrames: FrameRequestCallback[];
      kanbanFocusOriginalFrame: typeof requestAnimationFrame;
    };
    state.kanbanFocusFrames = [];
    state.kanbanFocusOriginalFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      state.kanbanFocusFrames.push(callback);
      return 1;
    };
    (button as HTMLButtonElement).click();
  });
  const addedId = await page.evaluate(
    (id) => window.__rivtoDemo.editor.blocks.getChildIds(id).at(-1)!,
    boardId,
  );
  await expect(
    board.locator(`[data-block-id="${addedId}"] [data-block-content]`).first(),
  ).toBeVisible();
  const result = await page.evaluate(() => {
    const state = window as unknown as {
      kanbanFocusFrames: FrameRequestCallback[];
      kanbanFocusOriginalFrame: typeof requestAnimationFrame;
    };
    const panel = window.__rivtoDemo.reactEditor.panels.getDefault() as unknown as {
      /**
       * Changes the fixture panel registration state.
       *
       * @param enabled - Whether the panel should participate in input routing.
       * @returns The registration state has been updated.
       */
      setEnabled(enabled: boolean): void;
    };
    panel.setEnabled(false);
    panel.setEnabled(true);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    window.requestAnimationFrame = state.kanbanFocusOriginalFrame;
    for (const callback of state.kanbanFocusFrames) {
      callback(performance.now());
    }
    const retained = document.activeElement === outside;
    outside.remove();
    return retained;
  });
  expect(result).toBe(true);
});
