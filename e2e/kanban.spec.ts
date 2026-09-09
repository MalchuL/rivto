/** Browser regression for moving real editor blocks across Kanban boundaries. */
import { expect, test, type Locator, type Page } from "@playwright/test";

const ROW_CLASS = "page-block-row";
const HANDLE_CLASS = "page-drag-handle";

/**
 * Moves a block through the pointer sensor to a target's interior.
 * @param page - Browser page owning the editor.
 * @param source - Block subtree to move.
 * @param target - Destination rectangle.
 * @param fraction - Vertical fraction of the target used for before/after placement.
 * @param axis - Direction used to choose the destination half.
 * @returns Completion of the drag gesture.
 */
async function move(page: Page, source: Locator, target: Locator, fraction = 0.5, axis: "vertical" | "horizontal" = "vertical") {
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await source.scrollIntoViewIfNeeded();
  const handle = source.locator(`:scope > .${ROW_CLASS} .${HANDLE_CLASS}`);
  await source.locator(`:scope > .${ROW_CLASS}`).hover();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x + to.width * (axis === "horizontal" ? fraction : 0.5), to.y + to.height * (axis === "vertical" ? fraction : 0.5), { steps: 15 });
  if (axis === "horizontal") {
    const indicator = target.locator(':scope > [data-axis="horizontal"]');
    await expect(indicator).toBeVisible();
    const line = (await indicator.boundingBox())!;
    const column = (await target.boundingBox())!;
    expect(Math.abs(line.height - column.height)).toBeLessThanOrEqual(1);
    expect(line.width).toBe(4);
    if (fraction < 0.5) expect(line.x).toBeCloseTo(column.x - 10, 0);
    else expect(line.x).toBeCloseTo(column.x + column.width + 6, 0);
    await expect(target).not.toHaveCSS("background-color", "rgb(220, 234, 255)");
    await expect(source).toHaveCSS("outline-style", "dashed");
  }
  await page.mouse.up();
  if (axis === "horizontal") {
    await expect(target.locator(':scope > [data-axis="horizontal"]')).toHaveCount(0);
    await expect(source).not.toHaveAttribute("data-dragging", "true");
  }
}

test("moves cards between columns, back to the outline, and into an empty column", async ({ page }) => {
  await page.goto("/");
  const board = page.locator('[data-block-type="kanban"]').first();
  await board.scrollIntoViewIfNeeded();
  const columns = board.locator('[data-block-type="kanban-column"]');
  const card = page.locator('[data-block-id]').filter({ has: page.getByText("Drag me between columns or back into the editor", { exact: true }) }).last();
  const id = await card.getAttribute("data-block-id");
  const stableCard = page.locator(`[data-block-id="${id}"]`);
  await move(page, stableCard, columns.nth(1));
  await expect(columns.nth(1).locator(`[data-block-id="${id}"]`)).toHaveCount(1);
  // The board title is at the outline level; its top edge inserts before it.
  const handle = stableCard.locator(`:scope > .${ROW_CLASS} .${HANDLE_CLASS}`);
  await handle.hover();
  const from = (await handle.boundingBox())!;
  const to = (await board.locator(`:scope > .${ROW_CLASS}`).boundingBox())!;
  await page.mouse.move(from.x + 3, from.y + 3);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 1, { steps: 20 });
  await page.mouse.up();
  await expect(board.locator(`[data-block-id="${id}"]`)).toHaveCount(0);
  await expect(stableCard).toHaveCount(1);
  await move(page, stableCard, columns.nth(2));
  await expect(columns.nth(2).locator(`[data-block-id="${id}"]`)).toHaveCount(1);
});


test("moves Kanban cards in edgeless mode", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "kanban")!;
    editor.load({ ...editor.dump(), blocks: [board], elements: [] });
    editor.elements.insertElement({
      type: "block", zIndex: 0, frame: { x: 20, y: 20, width: 800, height: 400 },
      props: { startBlockId: board.id, endBlockId: board.id },
    });
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  const chrome = page.locator("[data-edgeless-root] > .edgeless-card-content");
  const lanes = page.locator('[data-block-type="kanban"] > .page-block-children');
  await expect.poll(() => chrome.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await expect.poll(() => lanes.evaluate((element) => {
    const last = element.lastElementChild as HTMLElement | null;
    return last ? element.scrollWidth - (last.offsetLeft + last.offsetWidth) : 0;
  })).toBeLessThanOrEqual(2);
  const columns = page.locator('[data-block-type="kanban-column"]');
  const card = columns.first().locator('[data-block-type="paragraph"]');
  const id = await card.getAttribute("data-block-id");
  await move(page, card, columns.nth(1));
  await expect(columns.nth(1).locator(`[data-block-id="${id}"]`)).toHaveCount(1);
  await expect.poll(() => chrome.evaluate((element) => element.scrollLeft)).toBe(0);
  await expect.poll(() => chrome.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
});


for (const mode of ["block", "edgeless"] as const) {
  test(`reorders sibling cards in ${mode} mode without nesting`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/");
    await page.evaluate((mode) => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "kanban")!;
      editor.load({ ...editor.dump(), blocks: [board], elements: [] });
      const column = board.children[0]!;
      for (const content of ["Second card", "Third card"]) {
        const id = editor.blocks.insertBlock({ type: "paragraph", content }, board.id);
        editor.blocks.moveBlocks([id], column.id, "inside");
      }
      if (mode === "edgeless") editor.elements.insertElement({
        type: "block", zIndex: 0, frame: { x: 20, y: 20, width: 950, height: 500 },
        props: { startBlockId: board.id, endBlockId: board.id },
      });
      editor.history.clear();
    }, mode);
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    const column = page.locator('[data-block-type="kanban-column"]').first();
    const cards = column.locator(':scope > div > [data-block-type="paragraph"]');
    const ids = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-block-id")));
    const byId = (id: string | null) => page.locator(`[data-block-id="${id}"]`);
    await move(page, byId(ids[2]!), byId(ids[0]!), 0.25);
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toHaveAttribute("data-block-id", ids[2]!);
    await move(page, byId(ids[2]!), byId(ids[1]!), 0.75);
    await expect(cards.last()).toHaveAttribute("data-block-id", ids[2]!);
    await expect(cards).toHaveCount(3);
    // Wait for the visible reorder transition before beginning a new action.
    await expect.poll(() => column.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    await column.getByRole("button", { name: "Add card to To do" }).click();
    await expect(cards).toHaveCount(4);
    await expect(column.getByLabel("4 cards", { exact: true })).toHaveText("4");
    await page.getByRole("button", { name: "Expand Kanban", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Expanded Kanban" });
    await expect(modal).toBeVisible();
    await expect(byId(ids[0]!)).toHaveCount(1);
    await expect(modal.getByRole("combobox")).toHaveCount(0);
    const progress = modal.locator('[data-block-type="kanban-column"]').nth(1);
    await move(page, byId(ids[0]!), progress);
    await expect(progress.locator(`[data-block-id="${ids[0]}"]`)).toHaveCount(1);
    await move(page, byId(ids[0]!), byId(ids[1]!), 0.25);
    await expect(cards.first()).toHaveAttribute("data-block-id", ids[0]!);
    const lanes = modal.locator('[data-block-type="kanban"] > div > [data-block-type="kanban-column"]');
    const laneIds = await lanes.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-block-id")));
    await move(page, byId(laneIds[0]!), byId(laneIds[2]!), 0.8, "horizontal");
    await expect(lanes.last()).toHaveAttribute("data-block-id", laneIds[0]!);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await modal.getByRole("button", { name: "Add Kanban column" }).click();
    await expect(lanes).toHaveCount(4);
    await expect(lanes.last().getByLabel("Kanban column title")).toBeFocused();
    await page.keyboard.type("Ideas ");
    await expect(lanes.last().getByLabel("Kanban column title")).toContainText("Ideas");
    await expect(byId(laneIds[0]!).locator(':scope > div > [data-block-type="paragraph"]')).toHaveCount(4);
    await expect(modal.locator('[data-slot-position="right"]').getByRole("button", { name: "Collapse Kanban" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await modal.getByRole("button", { name: "Collapse Kanban" }).click();
    await expect(page.getByRole("dialog", { name: "Expanded Kanban" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expand Kanban", exact: true })).toBeFocused();
    await expect(byId(laneIds[0]!).locator(':scope > div > [data-block-type="paragraph"]')).toHaveCount(4);
  });
}
