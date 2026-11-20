import { expect, test, type Locator, type Page } from "@playwright/test";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`decorates and converts a TODO prompt in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      await page.evaluate(() => {
        const editor = window.__rivtoDemo.editor;
        editor.history.batchUpdates(() => {
          editor.blocks.insertBlock({ id: "todo-prompt-perf-separator", type: "separator" });
          for (const id of ["first", "second", "third", "anchor"]) {
            editor.blocks.insertBlock({
              id: `todo-prompt-perf-${id}`,
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
                    item.type === "block" && item.props.startBlockId === "todo-prompt-perf-first",
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
                item.type === "block" && item.props.startBlockId === "todo-prompt-perf-first",
            )!;
          editor.elements.updateElement(card.id, {
            frame: { x: 60, y: 60, width: 400, height: 240 },
            zIndex: 100000,
          });
        });
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const samples = [];
      const anchor = page.locator('[data-block-id="todo-prompt-perf-anchor"] [data-block-content]');
      for (const name of ["first", "second", "third"]) {
        const id = `todo-prompt-perf-${name}`;
        const block = page.locator(`[data-block-id="${id}"]`);
        const content = block.locator("[data-block-content]");
        await content.click();
        await page.keyboard.type("tas");
        const input = await measureInput(page);
        await expect(content.locator(".rivto-todo-prompt")).toHaveText("task");
        await expect(content).toBeFocused();
        const convert = await measurePointer(page, anchor);
        await expect(block).toHaveAttribute("data-block-type", "todo-item");
        samples.push({ input, convert });
      }
      console.log(JSON.stringify({ interaction: "todo-prompt", mode, repeat, samples }));
    });
  }
}

/**
 * Measures the final prompt character and its following browser frames.
 *
 * @param page - Warm editor with the partial prompt entered.
 * @returns Synchronous input delivery and two-frame durations in milliseconds.
 */
async function measureInput(page: Page) {
  await startTiming(page, "input");
  await page.keyboard.type("k");
  return finishTiming(page);
}

/**
 * Measures a pointer-down that leaves the candidate and converts it.
 *
 * @param page - Warm editor with a decorated prompt.
 * @param target - Another visible content host to activate.
 * @returns Synchronous pointer delivery and two-frame durations in milliseconds.
 */
async function measurePointer(page: Page, target: Locator) {
  await startTiming(page, "pointerdown");
  await target.click();
  return finishTiming(page);
}

/**
 * Installs timing listeners for the next browser event.
 *
 * @param page - Editor page receiving the event.
 * @param type - Event phase to measure.
 * @returns The next matching event will be measured through two frames.
 */
async function startTiming(page: Page, type: "input" | "pointerdown") {
  await page.evaluate((eventType) => {
    const state = window as unknown as { todoPromptTiming: unknown };
    state.todoPromptTiming = null;
    window.addEventListener(
      eventType,
      () => {
        const start = performance.now();
        window.addEventListener(
          eventType,
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.todoPromptTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  }, type);
}

/**
 * Waits for the recorded two-frame measurement.
 *
 * @param page - Editor page containing the timing record.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function finishTiming(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { todoPromptTiming: unknown }).todoPromptTiming,
  );
  return page.evaluate(() => (window as unknown as { todoPromptTiming: unknown }).todoPromptTiming);
}
