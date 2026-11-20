import { expect, test, type Page } from "@playwright/test";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`clears a TODO prompt decoration in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      await page.evaluate(() => {
        const editor = window.__rivtoDemo.editor;
        editor.history.batchUpdates(() => {
          editor.blocks.insertBlock({ id: "todo-cleanup-perf-separator", type: "separator" });
          for (const id of ["first", "second", "third"]) {
            editor.blocks.insertBlock({
              id: `todo-cleanup-perf-${id}`,
              type: "paragraph",
              content: "",
            });
          }
        });
      });
      if (mode === "edgeless") {
        await expect
          .poll(() =>
            page.evaluate(() =>
              window.__rivtoDemo.editor.elements
                .getElementNodes()
                .some(
                  (item) =>
                    item.type === "block" && item.props.startBlockId === "todo-cleanup-perf-first",
                ),
            ),
          )
          .toBe(true);
        await page.evaluate(() => {
          const editor = window.__rivtoDemo.editor;
          const card = editor.elements
            .getElementNodes()
            .find(
              (item) =>
                item.type === "block" && item.props.startBlockId === "todo-cleanup-perf-first",
            )!;
          editor.elements.updateElement(card.id, {
            frame: { x: 60, y: 60, width: 400, height: 180 },
            zIndex: 100000,
          });
        });
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const samples = [];
      for (const name of ["first", "second", "third"]) {
        const content = page.locator(
          `[data-block-id="todo-cleanup-perf-${name}"] [data-block-content]`,
        );
        await content.click();
        await page.keyboard.type("task text");
        await expect(content.locator(".rivto-todo-prompt")).toHaveText("task");
        await page.keyboard.press("Home");
        samples.push(await measureInput(page));
        await expect(content.locator(".rivto-todo-prompt")).toHaveCount(0);
        await expect(content).toHaveText("xtask text");
        await expect(content).toBeFocused();
      }
      console.log(JSON.stringify({ interaction: "todo-prompt-cleanup", mode, repeat, samples }));
    });
  }
}

/**
 * Measures input that invalidates the prompt and the following two frames.
 *
 * @param page - Warm editor with a decorated prompt and the caret at its start.
 * @returns Synchronous input delivery and two-frame durations in milliseconds.
 */
async function measureInput(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as { todoCleanupTiming: unknown };
    state.todoCleanupTiming = null;
    window.addEventListener(
      "input",
      () => {
        const start = performance.now();
        window.addEventListener(
          "input",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.todoCleanupTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.type("x");
  await page.waitForFunction(
    () => (window as unknown as { todoCleanupTiming: unknown }).todoCleanupTiming,
  );
  return page.evaluate(
    () => (window as unknown as { todoCleanupTiming: unknown }).todoCleanupTiming,
  );
}
