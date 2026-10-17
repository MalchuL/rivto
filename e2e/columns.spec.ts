/** Browser regression for headerless columns layout and column-count settings. */
import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Opens a board with unequal content heights on the requested demo surface.
 *
 * @param page - Browser page whose default demo document is replaced.
 * @param mode - Page or edgeless presentation of the same three-column board.
 * @returns Resolves once the document is seeded and the surface is selected.
 */
async function openUnequalColumns(page: Page, mode: "block" | "edgeless") {
  await page.goto("/");
  await page.evaluate((mode) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const columns = [8, 1, 3].map((count) => ({
      type: "columns-column",
      children: Array.from({ length: count }, (_, index) => ({
        type: "paragraph",
        content: `Line ${index + 1}`,
      })),
    }));
    const id = editor.blocks.insertBlock({ type: "columns", children: columns }).id;
    editor.load({
      ...editor.dump(),
      rootElementIds: [],
      blocks: [editor.blocks.getBlock(id)!],
      elements: [],
    });
    if (mode === "edgeless") {
      editor.elements.insertElement({
        type: "block",
        zIndex: 0,
        frame: { x: 20, y: 20, width: 950, height: 500 },
        props: { startBlockId: id, endBlockId: id },
      });
    }
  }, mode);
  await page.locator(`[data-editor-mode="${mode}"]`).click();
}

for (const mode of ["block", "edgeless"] as const) {
  test(`extends every divider to the tallest column in ${mode} mode`, async ({ page }) => {
    await openUnequalColumns(page, mode);
    const board = page.locator('[data-block-type="columns"]').first();
    await board.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        board.locator(":scope > .page-block-children > .page-block").evaluateAll((columns) => {
          const maximum = Math.max(
            ...columns.map((column) => column.getBoundingClientRect().height),
          );
          return columns.slice(1).map((column) => {
            const divider = getComputedStyle(column, "::before");
            return Math.abs(parseFloat(divider.height) + 24 - maximum);
          });
        }),
      )
      .toEqual([0, 0]);

    await board.getByRole("button", { name: "Columns settings" }).click();
    const checkbox = page.getByRole("checkbox", { name: "Show dividers" });
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    /**
     * Reads only this board's generated dividers, excluding any nested boards.
     *
     * @returns Current pseudo-element content for each divider after the first lane.
     */
    const separatorContent = () =>
      board
        .locator(":scope > .page-block-children > .page-block")
        .evaluateAll((columns) =>
          columns.slice(1).map((column) => getComputedStyle(column, "::before").content),
        );
    await expect.poll(separatorContent).toEqual(["none", "none"]);
    await checkbox.check();
    await expect.poll(separatorContent).toEqual(['""', '""']);
  });
}

test("keeps nested blocks when settings remove a column and does not scroll horizontally", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "columns")!;
    editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
  });
  const board = page.locator('[data-block-type="columns"]').first();
  await board.scrollIntoViewIfNeeded();
  const lanes = board.locator(":scope > .page-block-children");
  const columns = page.locator('[data-block-type="columns-column"]');
  await expect(columns).toHaveCount(2);
  await expect
    .poll(() =>
      columns.nth(1).evaluate((element) => {
        const separator = getComputedStyle(element, "::before");
        return [separator.content, separator.top, separator.bottom];
      }),
    )
    .toEqual(['""', "12px", "12px"]);
  await expect(board).toContainText("Left column");
  await expect(board).toContainText("Right column");
  await expect
    .poll(() => lanes.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);

  await board.getByRole("button", { name: "Columns settings" }).click();
  await page.getByRole("button", { name: "Remove column" }).click();
  await expect(columns).toHaveCount(1);
  await expect(columns.first()).toContainText("Left column");
  await expect(columns.first()).toContainText("Right column");
  await expect
    .poll(() => lanes.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Add column" }).click();
  await expect(columns).toHaveCount(2);
  await expect(columns.first()).toContainText("Left column");
  await expect(columns.first()).toContainText("Right column");
});

test("creates a writing block on empty-column click without retaining the empty control height", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "columns")!;
    editor.blocks.removeBlocks(
      board.children.flatMap((column) => column.children.map((child) => child.id)),
    );
    editor.load({
      ...editor.dump(),
      rootElementIds: [],
      blocks: [editor.blocks.getBlock(board.id)!],
      elements: [],
    });
  });
  const columns = page.locator('[data-block-type="columns-column"]');
  const first = columns.first();
  const second = columns.nth(1);
  await expect(first.locator(":scope > .page-block-children")).toHaveCount(0);
  await first.getByRole("button", { name: "Column", exact: true }).click();
  await expect(first.locator(":scope > .page-block-children > .page-block")).toHaveCount(1);
  await expect(first.locator(":scope > .page-block-row")).toBeHidden();
  const content = first.locator(":scope > .page-block-children");
  expect((await content.boundingBox())!.height).toBeLessThan((await second.boundingBox())!.height);
  expect((await first.boundingBox())!.height).toBe((await second.boundingBox())!.height);
});

test("aligns the inside-drop highlight with an empty column", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "columns")!;
    editor.blocks.removeBlocks(board.children[0]!.children.map((child) => child.id));
    // Measure column feedback in one layout, away from outer-page scroll edges.
    editor.load({
      ...editor.dump(),
      rootElementIds: [],
      blocks: [editor.blocks.getBlock(board.id)!],
      elements: [],
    });
  });

  const board = page.locator('[data-block-type="columns"]').first();
  await board.scrollIntoViewIfNeeded();
  const columns = board.locator('[data-block-type="columns-column"]');
  const source = columns.nth(1).locator('[data-block-type="paragraph"]').first();
  const sourceRow = source.locator(":scope > .page-block-row");
  const handle = sourceRow.locator(".block-handle");
  const target = columns.first();
  await sourceRow.hover();
  await handle.hover();
  await expect(handle).toHaveAttribute("aria-roledescription", "draggable");
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });

  await expect(target).toHaveAttribute("data-drop-inside");
  const highlight = target.locator(":scope > .page-drop-indicator");
  const highlightBox = (await highlight.boundingBox())!;
  expect(highlightBox.x).toBeCloseTo(to.x, 0);
  expect(highlightBox.y).toBeCloseTo(to.y, 0);
  expect(highlightBox.width).toBeCloseTo(to.width, 0);
  expect(highlightBox.height).toBeCloseTo(to.height, 0);
  await page.mouse.up();
});

test("aligns sibling drag handles when only one block has a collapse toggle", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "columns")!;
    const column = board.children[0]!;
    editor.blocks.removeBlocks(column.children.map((child) => child.id));
    const parent = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Collapsible",
      children: [{ type: "paragraph", content: "Nested" }],
    }).id;
    const sibling = editor.blocks.insertBlock({ type: "paragraph", content: "Sibling" }).id;
    editor.blocks.moveBlocks([parent, sibling], column.id, "inside");
    editor.blocks.updateBlock(parent, { listProps: { collapsed: true } });
    editor.load({
      ...editor.dump(),
      rootElementIds: [],
      blocks: [editor.blocks.getBlock(board.id)!],
      elements: [],
    });
  });

  const column = page.locator('[data-block-type="columns-column"]').first();
  const children = column.locator(":scope > .page-block-children > .page-block");
  const collapsibleHandle = children.nth(0).locator(":scope > .page-block-row .block-handle");
  const siblingHandle = children.nth(1).locator(":scope > .page-block-row .block-handle");
  const collapsibleBox = (await collapsibleHandle.boundingBox())!;
  const siblingBox = (await siblingHandle.boundingBox())!;
  const siblingRowBox = (await children.nth(1).locator(":scope > .page-block-row").boundingBox())!;
  const siblingContentBox = (await children
    .nth(1)
    .locator(":scope > .page-block-row > .rivto-block-content-flow")
    .boundingBox())!;
  expect(siblingBox.x).toBeCloseTo(collapsibleBox.x, 0);
  expect(siblingContentBox.x - siblingRowBox.x).toBeCloseTo(0, 0);

  const siblingBlockBox = (await children.nth(1).boundingBox())!;
  for (const x of [siblingBlockBox.x + 1, siblingBlockBox.x + siblingBlockBox.width - 1]) {
    await page.mouse.move(0, 0);
    await page.mouse.move(x, siblingRowBox.y + siblingRowBox.height / 2);
    await expect(siblingHandle).toHaveCSS("opacity", "1");
  }
});
