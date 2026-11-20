import { expect, test, type Page } from "@playwright/test";
import type { TableResizeTiming, TableResizeWindow } from "./types";

/**
 * Inserts an isolated table into the current demo document.
 *
 * @param page - Demo page with its editor already mounted.
 * @returns The document contains the table and surrounding separators.
 */
async function insertTable(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { editor } = (window as unknown as TableResizeWindow).__rivtoDemo;
    const separator = editor.blocks.insertBlock(
      { id: "table-perf-before", type: "separator" },
      editor.blocks.getInsertionDestinationAfter(editor.blocks.getRootIds()[0]!),
    );
    editor.blocks.insertBlock(
      {
        id: "table-perf",
        type: "table",
        children: ["a", "b"].map((row) => ({
          id: `table-perf-${row}`,
          type: "table-row",
          children: ["a", "b"].map((column) => ({
            id: `table-perf-${row}-${column}`,
            type: "table-cell",
            content: `${row} ${column}`,
            props: { tableColumnWidth: 180 },
          })),
        })),
      },
      editor.blocks.getInsertionDestinationAfter(separator.id),
    );
    editor.blocks.insertBlock(
      { id: "table-perf-after", type: "separator" },
      editor.blocks.getInsertionDestinationAfter("table-perf"),
    );
  });
}

/**
 * Places the table's Edgeless card above other canvas content.
 *
 * @param page - Demo page containing the inserted table.
 * @returns Edgeless mode is active with the table reachable.
 */
async function showEdgelessTable(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as TableResizeWindow).__rivtoDemo.editor.elements
          .getElementNodes()
          .some(
            (element) => element.type === "block" && element.props.startBlockId === "table-perf",
          ),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const { editor } = (window as unknown as TableResizeWindow).__rivtoDemo;
    const card = editor.elements
      .getElementNodes()
      .find((element) => element.type === "block" && element.props.startBlockId === "table-perf")!;
    editor.elements.updateElement(card.id, {
      frame: { x: 20, y: 20, width: 800, height: 400 },
      zIndex: 100000,
    });
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
}

/**
 * Measures two frames after the resize pointer is pressed.
 *
 * @param page - Demo page with its pointer over the handle.
 * @returns Milliseconds from pointer down to the second animation frame.
 */
async function measureStart(page: Page): Promise<number> {
  await page.evaluate(() => {
    const state = window as unknown as TableResizeWindow;
    state.tableResizeStart = null;
    window.addEventListener(
      "pointerdown",
      () => {
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.tableResizeStart = performance.now() - start;
          }),
        );
      },
      { capture: true, once: true },
    );
  });
  await page.mouse.down();
  await page.waitForFunction(
    () => (window as unknown as TableResizeWindow).tableResizeStart !== null,
  );
  const startFrames = await page.evaluate(
    () => (window as unknown as TableResizeWindow).tableResizeStart!,
  );
  return startFrames;
}

/**
 * Measures four successive pointer moves during a table resize.
 *
 * @param page - Demo page with an active resize.
 * @param x - Handle origin in viewport CSS pixels.
 * @param y - Handle height in viewport CSS pixels.
 * @returns Synchronous and two-frame timings for each move.
 */
async function measureMoves(page: Page, x: number, y: number) {
  const samples: TableResizeTiming[] = [];
  for (let sample = 0; sample < 4; sample++) {
    await page.evaluate(() => {
      const state = window as unknown as TableResizeWindow;
      state.tableResizeTiming = null;
      let start = 0;
      window.addEventListener(
        "pointermove",
        () => {
          start = performance.now();
        },
        { capture: true, once: true },
      );
      window.addEventListener(
        "pointermove",
        () => {
          const sync = performance.now() - start;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              state.tableResizeTiming = { sync, rendered: performance.now() - start };
            }),
          );
        },
        { once: true },
      );
    });
    await page.mouse.move(x + 10 * (sample + 1), y);
    await page.waitForFunction(
      () => (window as unknown as TableResizeWindow).tableResizeTiming !== null,
      null,
      { timeout: 5000 },
    );
    samples.push(
      await page.evaluate(() => (window as unknown as TableResizeWindow).tableResizeTiming!),
    );
  }
  return samples;
}

/**
 * Releases the pointer and checks that the preview was committed.
 *
 * @param page - Demo page with an active resize.
 * @returns The first column's persisted width is 220 pixels.
 */
async function finishResize(page: Page): Promise<void> {
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as TableResizeWindow).__rivtoDemo.editor.blocks.getBlockNode(
            "table-perf-a-a",
          )?.props.tableColumnWidth,
      ),
    )
    .toBe(220);
}

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`previews a table column in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
      await insertTable(page);
      if (mode === "edgeless") {
        await showEdgelessTable(page);
      }
      const handle = page
        .locator('[data-block-id="table-perf-a-a"]')
        .getByRole("separator", { name: "Resize table column" });
      await handle.scrollIntoViewIfNeeded();
      const rect = (await handle.boundingBox())!;
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height - 3;
      await handle.hover({ position: { x: rect.width / 2, y: rect.height - 3 }, timeout: 5000 });
      await page.mouse.move(x, y);
      const startFrames = await measureStart(page);
      const samples = await measureMoves(page, x, y);
      await finishResize(page);
      console.log(
        JSON.stringify({
          interaction: "table-resize",
          mode,
          repeat,
          startFrames,
          samples: samples.slice(1),
        }),
      );
    });
  }
}
