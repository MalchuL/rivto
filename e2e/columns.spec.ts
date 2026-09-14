/** Browser regression for headerless columns layout and column-count settings. */
import { expect, test } from "@playwright/test";

test("keeps nested blocks when settings remove a column and does not scroll horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "columns")!;
    editor.load({ ...editor.dump(), blocks: [board], elements: [] });
  });
  const board = page.locator('[data-block-type="columns"]').first();
  await board.scrollIntoViewIfNeeded();
  const lanes = board.locator(":scope > .page-block-children");
  const columns = page.locator('[data-block-type="columns-column"]');
  await expect(columns).toHaveCount(2);
  await expect.poll(() => columns.nth(1).evaluate((element) => {
    const separator = getComputedStyle(element, "::before");
    return [separator.content, separator.top, separator.bottom];
  })).toEqual(['\"\"', "12px", "12px"]);
  await expect(board).toContainText("Left column");
  await expect(board).toContainText("Right column");
  await expect.poll(() => lanes.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  await board.getByRole("button", { name: "Columns settings" }).click();
  await page.getByRole("button", { name: "Remove column" }).click();
  await expect(columns).toHaveCount(1);
  await expect(columns.first()).toContainText("Left column");
  await expect(columns.first()).toContainText("Right column");
  await expect.poll(() => lanes.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Add column" }).click();
  await expect(columns).toHaveCount(2);
  await expect(columns.first()).toContainText("Left column");
  await expect(columns.first()).toContainText("Right column");
});

test("creates a writing block on empty-column click and then wraps its content", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "columns")!;
    editor.blocks.removeBlocks(board.children.flatMap((column) => column.children.map((child) => child.id)));
    editor.load({ ...editor.dump(), blocks: [editor.blocks.getBlock(board.id)!], elements: [] });
  });
  const columns = page.locator('[data-block-type="columns-column"]');
  const first = columns.first();
  const second = columns.nth(1);
  await expect(first.locator(":scope > .page-block-children")).toHaveCount(0);
  await first.getByRole("button", { name: "Column", exact: true }).click();
  await expect(first.locator(":scope > .page-block-children > .page-block")).toHaveCount(1);
  expect((await first.boundingBox())!.height).toBeLessThan((await second.boundingBox())!.height);
});
