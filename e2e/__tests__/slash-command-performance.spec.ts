import { expect, test, type Page } from "@playwright/test";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`executes a slash command in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      await page.evaluate(() => {
        const editor = window.__rivtoDemo.editor;
        editor.history.batchUpdates(() => {
          editor.blocks.insertBlock({ id: "slash-command-perf-separator", type: "separator" });
          for (const id of ["first", "second", "third"]) {
            editor.blocks.insertBlock({
              id: `slash-command-perf-${id}`,
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
                    item.type === "block" && item.props.startBlockId === "slash-command-perf-first",
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
                item.type === "block" && item.props.startBlockId === "slash-command-perf-first",
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
        const id = `slash-command-perf-${name}`;
        const content = page.locator(`[data-block-id="${id}"] [data-block-content]`);
        await content.click();
        await page.keyboard.type("/list");
        const command = page.locator('[data-slash-command="list.numbered_list"]');
        await expect(command).toBeVisible();
        samples.push(await measureCommand(page, command));
        await expect(content).toBeFocused();
        await expect(content).toHaveText("");
        await expect
          .poll(() =>
            page.evaluate(
              (blockId) => window.__rivtoDemo.editor.blocks.getBlockNode(blockId)?.listProps.type,
              id,
            ),
          )
          .toBe("numbered_list");
      }
      console.log(JSON.stringify({ interaction: "slash-command", mode, repeat, samples }));
    });
  }
}

/**
 * Measures one menu command click and its following browser frames.
 *
 * @param page - Warm editor with the command menu open.
 * @param command - Visible command to execute.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measureCommand(page: Page, command: ReturnType<Page["locator"]>) {
  await page.evaluate(() => {
    const state = window as unknown as { slashCommandTiming: unknown };
    state.slashCommandTiming = null;
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
                state.slashCommandTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await command.click();
  await page.waitForFunction(
    () => (window as unknown as { slashCommandTiming: unknown }).slashCommandTiming,
  );
  return page.evaluate(
    () => (window as unknown as { slashCommandTiming: unknown }).slashCommandTiming,
  );
}
