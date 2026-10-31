import { blockDropRegion } from "./drop-regions";
/** Browser regression for moving real editor blocks across Kanban boundaries. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

import { BLOCK_ROW_SELECTOR } from "./dom-markers";
const HANDLE_CLASS = "block-handle";
const DROP_INDICATOR_SELECTOR = ".rivto-block-drop-line:visible";

/**
 * Moves a block through the pointer sensor into an explicitly declared region.
 * @param page - Browser page owning the editor.
 * @param source - Block subtree to move.
 * @param target - Destination rectangle.
 * @param position - Canonical sibling side or append action; defaults to inside.
 * @param axis - Flow axis used to check the physical indicator orientation.
 * @returns Completion of the drag gesture.
 */
async function move(
  page: Page,
  source: Locator,
  target: Locator,
  position: "before" | "after" | "inside" = "inside",
  axis: "vertical" | "horizontal" = "vertical",
) {
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  await source.scrollIntoViewIfNeeded();
  const handle = source.locator(`:scope > ${BLOCK_ROW_SELECTOR} .${HANDLE_CLASS}`);
  await source.locator(`:scope > ${BLOCK_ROW_SELECTOR}`).hover();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await expect(source).toHaveAttribute("data-dragging", "true");
  // A horizontally clipped lane is not a drop field until it is visible.
  await target.scrollIntoViewIfNeeded();
  const region = await blockDropRegion(target, position);
  const to = (await region.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  if (position !== "inside") {
    await expect(page.locator(DROP_INDICATOR_SELECTOR)).toBeVisible();
  }
  if (axis === "horizontal") {
    const indicator = page.locator(DROP_INDICATOR_SELECTOR);
    await expect(indicator).toBeVisible();
    const line = (await indicator.boundingBox())!;
    const column = (await target.boundingBox())!;
    expect(Math.abs(line.height - column.height)).toBeLessThanOrEqual(1);
    expect(line.width).toBe(2);
    expect(line.x + line.width / 2).toBeCloseTo(
      position === "after" ? column.x + column.width : column.x,
      0,
    );
    await expect(target).not.toHaveCSS("background-color", "rgb(220, 234, 255)");
    await expect(source).toHaveAttribute("data-dragging", "true");
    await expect(source).toHaveCSS("opacity", "0.45");
  }
  await page.mouse.up();
  if (axis === "horizontal") {
    await expect(page.locator(DROP_INDICATOR_SELECTOR)).toHaveCount(0);
    await expect(source).not.toHaveAttribute("data-dragging", "true");
  }
}

test("moves cards between columns, back to the outline, and into an empty column", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  const board = page.locator('[data-block-type="kanban"]').first();
  await board.scrollIntoViewIfNeeded();
  const columns = board.locator('[data-block-type="kanban-column"]');
  const card = page
    .locator("[data-block-id]")
    .filter({
      has: page.getByText("Drag me between columns or back into the editor", { exact: true }),
    })
    .last();
  const id = await card.getAttribute("data-block-id");
  const stableCard = page.locator(`[data-block-id="${id}"]`);
  await move(page, stableCard, columns.nth(1));
  await expect(columns.nth(1).locator(`[data-block-id="${id}"]`)).toHaveCount(1);
  // Measure the receiving edge after activation applies drag feedback and layout settles.
  await move(page, stableCard, board, "before");
  await expect(board.locator(`[data-block-id="${id}"]`)).toHaveCount(0);
  await expect(stableCard).toHaveCount(1);
  await move(page, stableCard, columns.nth(2));
  await expect(columns.nth(2).locator(`[data-block-id="${id}"]`)).toHaveCount(1);
});

test("moves Kanban cards in edgeless mode", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "kanban")!;
    editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
    editor.elements.insertElement({
      type: "block",
      zIndex: 0,
      frame: { x: 20, y: 20, width: 800, height: 400 },
      props: { startBlockId: board.id, endBlockId: board.id },
    });
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  const chrome = page.locator("[data-edgeless-root] > .edgeless-card-content");
  const lanes = page.locator('[data-block-type="kanban"] > .rivto-block-children');
  await expect
    .poll(() => chrome.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);
  await expect
    .poll(() =>
      lanes.evaluate((element) => {
        const last = element.lastElementChild as HTMLElement | null;
        if (!last) {
          return 0;
        }
        // The lane's offsetParent may be the board. Compare in the scrollport's
        // coordinates and retain its intentional trailing padding.
        const right =
          last.getBoundingClientRect().right -
          element.getBoundingClientRect().left +
          element.scrollLeft;
        return Math.abs(
          element.scrollWidth - right - Number.parseFloat(getComputedStyle(element).paddingRight),
        );
      }),
    )
    .toBeLessThanOrEqual(2);
  const columns = page.locator('[data-block-type="kanban-column"]');
  const card = columns.first().locator('[data-block-type="paragraph"]');
  const id = await card.getAttribute("data-block-id");
  await move(page, card, columns.nth(1));
  await expect(columns.nth(1).locator(`[data-block-id="${id}"]`)).toHaveCount(1);
  await expect.poll(() => chrome.evaluate((element) => element.scrollLeft)).toBe(0);
  await expect
    .poll(() => chrome.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);
});

for (const mode of ["block", "edgeless"] as const) {
  test(`reorders sibling cards from their outline edges in ${mode} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/?test_features=1");
    await page.evaluate((mode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "kanban")!;
      editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
      const column = board.children[0]!;
      for (const content of ["Second card", "Third card"]) {
        const id = editor.blocks.insertBlock(
          { type: "paragraph", content },
          editor.blocks.getInsertionDestinationAfter(board.id),
        ).id;
        editor.blocks.moveBlocks([id], column.id, "inside");
      }
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 950, height: 500 },
          props: { startBlockId: board.id, endBlockId: board.id },
        });
      }
      editor.history.clear();
    }, mode);
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    const column = page.locator('[data-block-type="kanban-column"]').first();
    const cards = column.locator(
      ':scope > .rivto-block-children > .rivto-kanban-card > [data-block-type="paragraph"]',
    );
    const ids = await cards.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-block-id")),
    );
    const byId = (id: string | null) => page.locator(`[data-block-id="${id}"]`);
    const rowById = (id: string | null) =>
      byId(id).locator(`:scope > ${BLOCK_ROW_SELECTOR}`).first();
    await move(page, byId(ids[2]!), rowById(ids[0]!), "before");
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toHaveAttribute("data-block-id", ids[2]!);
    await move(page, byId(ids[2]!), rowById(ids[1]!), "after");
    await expect(cards.last()).toHaveAttribute("data-block-id", ids[2]!);
    await expect(cards).toHaveCount(3);
    // Wait for the visible reorder transition before beginning a new action.
    await expect
      .poll(() => column.evaluate((element) => element.getAnimations({ subtree: true }).length))
      .toBe(0);
    await column.getByRole("button", { name: "Add card to To do" }).click();
    await expect(cards).toHaveCount(4);
    await expect(
      column.locator(":scope > .rivto-block-children > .rivto-kanban-add-card:last-child"),
    ).toHaveCount(1);
    await expect(column.getByLabel("4 cards", { exact: true })).toHaveText("4");
    await page.getByRole("button", { name: "Expand Kanban", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Expanded Kanban" });
    await expect(modal).toBeVisible();
    await expect(byId(ids[0]!)).toHaveCount(1);
    await expect(modal.getByRole("combobox")).toHaveCount(0);
    const progress = modal.locator('[data-block-type="kanban-column"]').nth(1);
    await move(page, byId(ids[0]!), progress);
    await expect(progress.locator(`[data-block-id="${ids[0]}"]`)).toHaveCount(1);
    await move(page, byId(ids[0]!), rowById(ids[1]!), "before");
    await expect(cards.first()).toHaveAttribute("data-block-id", ids[0]!);
    const lanes = modal.locator(
      '[data-block-type="kanban"] > div > [data-block-type="kanban-column"]',
    );
    const laneIds = await lanes.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-block-id")),
    );
    await move(page, byId(laneIds[0]!), byId(laneIds[2]!), "after", "horizontal");
    await expect(lanes.last()).toHaveAttribute("data-block-id", laneIds[0]!);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await modal.getByRole("button", { name: "Add Kanban column" }).click();
    await expect(lanes).toHaveCount(4);
    await expect(lanes.last().getByLabel("Kanban column title")).toBeFocused();
    await page.keyboard.type("Ideas ");
    await expect(lanes.last().getByLabel("Kanban column title")).toContainText("Ideas");
    await expect(
      byId(laneIds[0]!).locator(
        ':scope > .rivto-block-children > .rivto-kanban-card > [data-block-type="paragraph"]',
      ),
    ).toHaveCount(4);
    await expect(
      modal
        .locator('[data-slot-position="right"]')
        .getByRole("button", { name: "Collapse Kanban" }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    await modal.getByRole("button", { name: "Collapse Kanban" }).click();
    await expect(page.getByRole("dialog", { name: "Expanded Kanban" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expand Kanban", exact: true })).toBeFocused();
    await expect(
      byId(laneIds[0]!).locator(
        ':scope > .rivto-block-children > .rivto-kanban-card > [data-block-type="paragraph"]',
      ),
    ).toHaveCount(4);
  });
}

test("places Kanban add-card controls after cards and hides them while collapsed", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  const board = page.locator('[data-block-type="kanban"]').first();
  await board.scrollIntoViewIfNeeded();
  const addColumn = board.getByRole("button", { name: "Add Kanban column" });
  await expect(addColumn).toBeVisible();
  const boardToggle = board.locator(
    ':scope > .rivto-block-row :is([data-block-control="collapse"], [data-collapse-toggle])',
  );
  await boardToggle.click();
  await expect(boardToggle).toHaveAttribute("aria-expanded", "false");
  await expect(addColumn).toHaveCount(0);
  await boardToggle.click();
  await expect(addColumn).toBeVisible();

  const column = board.locator('[data-block-type="kanban-column"]').first();
  const addCard = column.getByRole("button", { name: "Add card to To do" });
  await expect(addCard).toBeVisible();
  await expect(
    column.locator(":scope > .rivto-block-children > .rivto-kanban-add-card:last-child"),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      column.evaluate((element) => {
        const card = element.querySelector(
          ":scope > .rivto-block-children > .rivto-kanban-card:last-of-type",
        );
        const button = element.querySelector(
          ":scope > .rivto-block-children > .rivto-kanban-add-card",
        );
        const list = button?.parentElement;
        return card && button && list
          ? button.getBoundingClientRect().top -
              card.getBoundingClientRect().bottom -
              Number.parseFloat(getComputedStyle(list).rowGap)
          : -1;
      }),
    )
    .toBe(0);
  const columnToggle = column.locator(
    ':scope > .rivto-block-row :is([data-block-control="collapse"], [data-collapse-toggle])',
  );
  await columnToggle.click();
  await expect(columnToggle).toHaveAttribute("aria-expanded", "false");
  await expect(addCard).toHaveCount(0);
  await columnToggle.click();
  await expect(addCard).toBeVisible();
  for (const count of [2, 3]) {
    await addCard.click();
    await expect(
      column.locator(":scope > .rivto-block-children > .rivto-kanban-card > .rivto-block"),
    ).toHaveCount(count);
    await expect(
      column.locator(":scope > .rivto-block-children > .rivto-kanban-add-card:last-child"),
    ).toHaveCount(1);
  }

  const emptyColumn = board.locator('[data-block-type="kanban-column"]').nth(1);
  const emptyAddCard = emptyColumn.getByRole("button", { name: "Add card to In progress" });
  await expect(
    emptyColumn.locator(":scope > .rivto-block-children > .rivto-kanban-add-card:last-child"),
  ).toHaveCount(1);
  await emptyAddCard.click();
  await expect(
    emptyColumn.locator(":scope > .rivto-block-children > .rivto-kanban-card > .rivto-block"),
  ).toHaveCount(1);
  await expect(
    emptyColumn.locator(":scope > .rivto-block-children > .rivto-kanban-add-card:last-child"),
  ).toHaveCount(1);
});

test("keeps one add-column control in each synced Kanban board", async ({ page }) => {
  await page.goto(`/?sync=1&room=kanban-controls-${Date.now()}`);
  const left = page.locator('[data-editor-sync="left"]');
  const right = page.locator('[data-editor-sync="right"]');
  const content = left
    .locator('.page-surface [data-block-type="paragraph"] [data-block-content]')
    .first();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/kanban");
  await page.locator('[data-slash-command="block.kanban.insert"]').click();

  for (const pane of [left, right]) {
    const board = pane.locator('[data-block-type="kanban"]');
    await expect(board).toHaveCount(1);
    await expect(
      board.locator(":scope > .rivto-block-children > .rivto-kanban-add-column"),
    ).toHaveCount(1);
  }
});
