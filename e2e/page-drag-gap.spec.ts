/**
 * Browser coverage for outline-gap drag targeting.
 *
 * A pointer in the space between two blocks must highlight the nearest
 * sibling, not the nearest kanban or table. Putting a block inside another
 * still requires hovering that block's row, or an empty lane body.
 *
 * @module
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const ROW_CLASS = "page-block-row";
const HANDLE_CLASS = "page-drag-handle";
const LINE_CLASS = "page-drop-indicator";
const CHILD_DROP_INDENT = 24;

/**
 * Arms a block handle and holds the pointer at a viewport point.
 *
 * @param page - Browser page owning the editor.
 * @param source - Block whose handle starts the gesture.
 * @param x - Destination viewport X.
 * @param y - Destination viewport Y.
 * @returns Completion after the cursor reaches the destination.
 */
async function holdDragAt(page: Page, source: Locator, x: number, y: number): Promise<void> {
  const handle = source.locator(`:scope > .${ROW_CLASS} .${HANDLE_CLASS}`);
  await source.locator(`:scope > .${ROW_CLASS}`).hover();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(x, y, { steps: 15 });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const { editor } = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
    }).__rivtoDemo.editor;
    const alpha = editor.blocks.insertBlock({ type: "paragraph", content: "Alpha" });
    const beta = editor.blocks.insertBlock({ type: "paragraph", content: "Beta" });
    const board = editor.blocks.insertBlock({
      type: "kanban",
      content: "Board",
      children: [
        { type: "kanban-column", content: "To do" },
        { type: "kanban-column", content: "Empty" },
      ],
    });
    editor.load({
      ...editor.dump(),
      blocks: [
        editor.blocks.getBlock(alpha)!,
        editor.blocks.getBlock(beta)!,
        editor.blocks.getBlock(board)!,
      ],
      elements: [],
    });
  });
});

test("a gap between outline blocks does not drop inside a later kanban", async ({ page }) => {
  const alpha = page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }).first();
  const beta = page.locator("[data-block-id]").filter({ has: page.getByText("Beta", { exact: true }) }).first();
  const board = page.locator('[data-block-type="kanban"]');
  const alphaBox = (await alpha.boundingBox())!;
  const betaBox = (await beta.boundingBox())!;
  await holdDragAt(page, alpha, alphaBox.x + 40, betaBox.y - 4);
  await expect(board).not.toHaveAttribute("data-drop-inside", "true");
  await expect(page.locator("[data-drop-inside]")).toHaveCount(0);
  await expect(page.locator(`.${LINE_CLASS}`)).toBeVisible();
  await page.mouse.up();
});

test("keeps a block in place from the bottom edge of the block above", async ({ page }) => {
  const roots = page.locator(`.page-surface > [data-block-id]`);
  const before = await roots.evaluateAll((blocks) => blocks.map((block) => block.getAttribute("data-block-id")));
  const alpha = roots.filter({ has: page.getByText("Alpha", { exact: true }) });
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const alphaRow = alpha.locator(`:scope > .${ROW_CLASS}`);
  const box = (await alphaRow.boundingBox())!;

  await holdDragAt(page, beta, box.x + CHILD_DROP_INDENT / 2, box.y + box.height - 2);
  const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
  await expect(line).toHaveCount(1);
  const lineBox = (await line.boundingBox())!;
  const alphaBox = (await alpha.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(alphaBox.y + alphaBox.height, 0);
  await page.mouse.up();

  await expect.poll(() => roots.evaluateAll(
    (blocks) => blocks.map((block) => block.getAttribute("data-block-id")),
  )).toEqual(before);
});

test("keeps a block in place from the top edge of the block below", async ({ page }) => {
  const roots = page.locator(`.page-surface > [data-block-id]`);
  const before = await roots.evaluateAll((blocks) => blocks.map((block) => block.getAttribute("data-block-id")));
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const board = page.locator('[data-block-type="kanban"]');
  const boardRow = board.locator(`:scope > .${ROW_CLASS}`);
  const box = (await boardRow.boundingBox())!;

  await holdDragAt(page, beta, box.x + CHILD_DROP_INDENT / 2, box.y + 2);
  const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
  await expect(line).toHaveCount(1);
  const lineBox = (await line.boundingBox())!;
  const boardBox = (await board.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(boardBox.y, 0);
  await page.mouse.up();

  await expect.poll(() => roots.evaluateAll(
    (blocks) => blocks.map((block) => block.getAttribute("data-block-id")),
  )).toEqual(before);
});

test("drops a block after the last root container", async ({ page }) => {
  const roots = page.locator(`.page-surface > [data-block-id]`);
  const alpha = roots.filter({ has: page.getByText("Alpha", { exact: true }) });
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const board = page.locator('[data-block-type="kanban"]');
  const alphaId = await alpha.getAttribute("data-block-id");
  const betaId = await beta.getAttribute("data-block-id");
  const boardId = await board.getAttribute("data-block-id");
  const boardBox = (await board.boundingBox())!;

  await holdDragAt(page, alpha, boardBox.x + CHILD_DROP_INDENT / 2, boardBox.y + boardBox.height + 12);
  const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(boardBox.y + boardBox.height, 0);
  await page.mouse.up();

  await expect.poll(() => roots.evaluateAll(
    (blocks) => blocks.map((block) => block.getAttribute("data-block-id")),
  )).toEqual([betaId, boardId, alphaId]);
});

test("drops a block before the first root container", async ({ page }) => {
  const roots = page.locator(`.page-surface > [data-block-id]`);
  const alpha = roots.filter({ has: page.getByText("Alpha", { exact: true }) });
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const board = page.locator('[data-block-type="kanban"]');
  const alphaId = await alpha.getAttribute("data-block-id");
  const betaId = await beta.getAttribute("data-block-id");
  const boardId = await board.getAttribute("data-block-id");
  await page.evaluate(({ alphaId, betaId, boardId }) => {
    const { editor } = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
    }).__rivtoDemo.editor;
    editor.load({
      ...editor.dump(),
      blocks: [boardId, alphaId, betaId].map((id) => editor.blocks.getBlock(id!)!),
      elements: [],
    });
  }, { alphaId, betaId, boardId });
  const boardBox = (await board.boundingBox())!;

  await holdDragAt(page, beta, boardBox.x + CHILD_DROP_INDENT / 2, boardBox.y - 12);
  const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(boardBox.y, 0);
  await page.mouse.up();

  await expect.poll(() => roots.evaluateAll(
    (blocks) => blocks.map((block) => block.getAttribute("data-block-id")),
  )).toEqual([betaId, boardId, alphaId]);
});

test("hovering a row body still puts the drop inside that block", async ({ page }) => {
  const alpha = page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }).first();
  const beta = page.locator("[data-block-id]").filter({ has: page.getByText("Beta", { exact: true }) }).first();
  const betaRow = beta.locator(`:scope > .${ROW_CLASS}`);
  const box = (await betaRow.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + box.height / 2);
  await expect(betaRow).toHaveAttribute("data-drop-inside", "true");
  const indicator = betaRow.locator(`:scope > .${LINE_CLASS}[data-kind='inside']`);
  await expect(indicator).toHaveCSS("outline-width", "4px");
  await expect(page.locator('[data-block-type="kanban"]')).not.toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();
});

test("an empty kanban column still accepts an inside drop on its body", async ({ page }) => {
  const alpha = page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }).first();
  const empty = page.locator('[data-block-type="kanban-column"]').nth(1);
  const alphaId = await alpha.getAttribute("data-block-id");
  const emptyId = await empty.getAttribute("data-block-id");
  const box = (await empty.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + box.height * 0.7);
  await expect(empty).toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();
  await expect.poll(() => page.evaluate(({ sourceId }) => {
    const { editor } = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
    }).__rivtoDemo.editor;
    return sourceId ? editor.blocks.getParentId(sourceId) : undefined;
  }, { sourceId: alphaId })).toBe(emptyId);
});

test("dragging onto a kanban title does not insert a column or paint a board-sized line", async ({ page }) => {
  const alpha = page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }).first();
  const board = page.locator('[data-block-type="kanban"]');
  const title = board.locator(`:scope > .${ROW_CLASS}`);
  const box = (await title.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + box.height / 2);
  await expect(board).not.toHaveAttribute("data-drop-inside", "true");
  const line = page.locator(`.${LINE_CLASS}`);
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.height).toBe(4);
  await expect(line).toHaveAttribute("data-axis", "horizontal");
  await page.mouse.up();
  await expect(page.locator('[data-block-type="kanban-column"]')).toHaveCount(2);
  await expect(page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }))
    .not.toHaveAttribute("data-block-type", "kanban-column");
});
