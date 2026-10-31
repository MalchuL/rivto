import { blockDropRegion } from "./drop-regions";
/** Browser coverage for responsive Bento layout, widths, shared modal and editing. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

const RESIZE_RIGHT = "Resize Bento tile from the right";
const RESIZE_LEFT = "Resize Bento tile from the left";
const ROW_CLASS = "rivto-block-row";
const PAGE_DRAG_HANDLE_CLASS = "block-handle";
// Child-region IDs have a per-view prefix; select direct tiles by the children container class.
const BENTO_TILES_SELECTOR =
  ":scope > .rivto-block-children > .rivto-bento-tile > .rivto-block-drop-wrapper-content > [data-block-id]";
// Page owns the tile placement in both writing pages and canvas cards.
const BENTO_ITEMS_SELECTOR = ":scope > .rivto-block-children > .rivto-bento-tile";

/**
 * Drags one Bento edge handle by a horizontal pixel delta.
 *
 * @param page - Browser page owning the editor.
 * @param handle - Left or right resize separator.
 * @param dx - Horizontal movement in CSS pixels; positive is rightward.
 * @returns After pointer release.
 */
async function dragResizeHandle(page: Page, handle: Locator, dx: number): Promise<void> {
  await handle.hover();
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

for (const mode of ["block", "edgeless"]) {
  test(`Bento editing and layout in ${mode}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.evaluate((mode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 800, height: 600 },
          props: { startBlockId: board.id, endBlockId: board.id },
        });
      }
    }, mode);
    if (mode === "edgeless") {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }
    const board = page.locator('[data-block-type="bento"]');
    const tiles = board.locator(BENTO_ITEMS_SELECTOR);
    await expect(tiles).toHaveCount(3);
    await expect(tiles.first()).toHaveCSS("flex-grow", "0");
    await expect(tiles.first()).toHaveCSS("flex-basis", "220px");
    await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^Expanded / })).toBeVisible();
    const first = tiles.first();
    await first.hover();
    const rightHandle = first.getByRole("separator", { name: RESIZE_RIGHT });
    await expect(rightHandle).toBeVisible();
    const startWidth = await first.evaluate((element) => (element as HTMLElement).offsetWidth);
    await dragResizeHandle(page, rightHandle, 80);
    const committed = `${Math.max(160, Math.min(960, startWidth + 80))}px`;
    await expect(first).toHaveCSS("flex-basis", committed);
    const editable = first.getByRole("textbox").first();
    await editable.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(tiles).toHaveCount(4);
    await expect(tiles.nth(1).getByRole("textbox")).toBeFocused();
    await page.keyboard.type("New tile");
    await expect(tiles.nth(1)).toContainText("New tile");
    await board.getByRole("button", { name: "Collapse Bento", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^Expanded / })).toHaveCount(0);
    // Width preferences survive snapshot reload, and tiles shrink to their surface.
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load(editor.dump());
    });
    await expect(first).toHaveCSS("flex-basis", committed);
    if (mode === "block") {
      await page.setViewportSize({ width: 420, height: 800 });
    }
    const box = (await board.boundingBox())!;
    for (const tile of await tiles.all()) {
      expect((await tile.boundingBox())!.width).toBeLessThanOrEqual(box.width);
    }
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.blocks.removeBlocks(board.children.map((child) => child.id));
    });
    await expect(tiles).toHaveCount(0);
    await expect(
      board.locator(
        ":scope > .rivto-block-row > :is(.rivto-block-content-flow, .rivto-block-content) > [data-block-selection-anchor]",
      ),
    ).not.toHaveAttribute("contenteditable");
    expect((await board.boundingBox())!.height).toBeGreaterThanOrEqual(128);
  });
}

test("Bento edge resize freezes siblings until pointer release", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
    editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
  });
  const board = page.locator('[data-block-type="bento"]');
  await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
  const tiles = board.locator(BENTO_ITEMS_SELECTOR);
  const first = tiles.first();
  const sibling = tiles.nth(1);
  await first.hover();
  const handle = first.getByRole("separator", { name: RESIZE_RIGHT });
  await expect(handle).toBeVisible();
  const origin = (await handle.boundingBox())!;
  const before = (await sibling.boundingBox())!;
  const startWidth = await first.evaluate((element) => (element as HTMLElement).offsetWidth);
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2 + 90, origin.y + origin.height / 2, {
    steps: 10,
  });
  const mid = (await sibling.boundingBox())!;
  expect(mid.x).toBeCloseTo(before.x, 0);
  expect(mid.y).toBeCloseTo(before.y, 0);
  expect(mid.width).toBeCloseTo(before.width, 0);
  await expect(first).toHaveAttribute("data-bento-resizing", "right");
  await page.mouse.up();
  await expect(first).not.toHaveAttribute("data-bento-resizing");
  await expect(first).toHaveCSS("flex-basis", `${Math.max(160, Math.min(960, startWidth + 90))}px`);

  await sibling.hover();
  const leftHandle = sibling.getByRole("separator", { name: RESIZE_LEFT });
  await expect(leftHandle).toBeVisible();
  const siblingBefore = (await first.boundingBox())!;
  const siblingStart = await sibling.evaluate((element) => (element as HTMLElement).offsetWidth);
  const leftBox = (await leftHandle.boundingBox())!;
  await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + leftBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + leftBox.width / 2 - 60, leftBox.y + leftBox.height / 2, {
    steps: 8,
  });
  const firstMid = (await first.boundingBox())!;
  expect(firstMid.x).toBeCloseTo(siblingBefore.x, 0);
  expect(firstMid.width).toBeCloseTo(siblingBefore.width, 0);
  await page.mouse.up();
  await expect(sibling).toHaveCSS(
    "flex-basis",
    `${Math.max(160, Math.min(960, siblingStart + 60))}px`,
  );
});

for (const edge of ["between", "under", "inside", "end-right", "end-under"] as const) {
  test(`Bento drag placement ${edge}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
    });
    const board = page.locator('[data-block-type="bento"]');
    await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
    const tiles = board.locator(BENTO_TILES_SELECTOR);
    const source = tiles.first();
    const end = edge.startsWith("end-");
    const target = end ? tiles.last() : tiles.nth(1);
    const sourceId = await source.getAttribute("data-block-id");
    const targetId = await target.getAttribute("data-block-id");
    const handleClass = "block-handle";
    const handle = source.locator(`:scope > .${ROW_CLASS} .${handleClass}`);
    await source.hover();
    await handle.hover();
    await expect(handle).toHaveAttribute("aria-roledescription", "draggable");
    const from = (await handle.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
    const inline = edge === "end-right" || edge === "between";
    const wrapper = target.locator("xpath=ancestor::*[@data-block-item-id][1]");
    const bounds = (await wrapper.boundingBox())!;
    let x = inline ? bounds.x + bounds.width - 3 : bounds.x + 12;
    let y = inline ? bounds.y + bounds.height / 2 : bounds.y + bounds.height - 3;
    if (edge === "inside") {
      const box = (await target.locator(`:scope > .${ROW_CLASS}`).boundingBox())!;
      x = box.x + box.width / 2;
      y = box.y + box.height / 2;
    }
    await page.mouse.move(x, y, { steps: 15 });
    const line = page.locator(".rivto-block-drop-line:visible");
    if (edge === "inside") {
      await expect(target).toHaveAttribute("data-block-drop-active", "true");
      await expect(line).toHaveCount(0);
      await expect(target).toHaveCSS("outline-style", "none");
      const overlay = await target.evaluate((element) => {
        const style = getComputedStyle(element, "::after");
        return { radius: style.borderRadius, shadow: style.boxShadow };
      });
      expect(overlay.radius).toBe("12px");
      expect(overlay.shadow).not.toBe("none");
    } else {
      await expect(line).toBeVisible();
      const lineBox = (await line.boundingBox())!;
      await expect(line).toHaveAttribute("data-axis", inline ? "vertical" : "horizontal");
      expect(inline ? lineBox.x + lineBox.width / 2 : lineBox.y + lineBox.height / 2).toBeCloseTo(
        inline ? bounds.x + bounds.width : bounds.y + bounds.height,
        0,
      );
    }
    await page.mouse.up();
    if (edge === "inside") {
      await expect(
        page.locator(`[data-block-id="${targetId}"] [data-block-id="${sourceId}"]`),
      ).toHaveCount(1);
    } else {
      await expect(
        page.locator(`[data-block-id="${targetId}"] [data-block-id="${sourceId}"]`),
      ).toHaveCount(0);
      await expect(end ? tiles.last() : tiles.nth(1)).toHaveAttribute("data-block-id", sourceId!);
    }
  });
}

test("drags a page block into a bento as a tile and a tile back onto the page", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const boardId = editor.blocks.insertBlock({
      type: "bento",
      content: "Drop board",
      children: [
        { type: "paragraph", content: "Tile A" },
        { type: "paragraph", content: "Tile B" },
      ],
    }).id;
    const outsideId = editor.blocks.insertBlock({ type: "paragraph", content: "From page" }).id;
    editor.load({
      ...editor.dump(),
      rootElementIds: [],
      blocks: [editor.blocks.getBlock(boardId)!, editor.blocks.getBlock(outsideId)!],
      elements: [],
    });
  });
  const board = page.locator('[data-block-type="bento"]');
  const tiles = board.locator(BENTO_TILES_SELECTOR);
  await expect(tiles).toHaveCount(2);
  const source = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("From page", { exact: true }) })
    .first();
  const target = tiles.first();
  const handleClass = "block-handle";
  const handle = source.locator(`:scope > .${ROW_CLASS} .${handleClass}`);
  await source.hover();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  const to = (await (await blockDropRegion(target, "before")).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
  // The declared before strip inserts a sibling into the board without nesting.
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(tiles).toHaveCount(3);

  const tile = tiles.filter({ has: page.getByText("From page", { exact: true }) }).first();
  const tileHandle = tile.locator(`:scope > .${ROW_CLASS} .${handleClass}`);
  await tile.hover();
  await tileHandle.hover();
  const tileFrom = (await tileHandle.boundingBox())!;
  const title = (await (await blockDropRegion(board, "before")).boundingBox())!;
  await page.mouse.move(tileFrom.x + 3, tileFrom.y + 3);
  await page.mouse.down();
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(tiles).toHaveCount(2);
  await expect(
    page.locator("[data-block-id]").filter({ has: page.getByText("From page", { exact: true }) }),
  ).toHaveCount(1);
});

test("drops a page block into an empty Bento grid", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const boardId = editor.blocks.insertBlock({ type: "bento", content: "" }).id;
    const sourceId = editor.blocks.insertBlock({ type: "paragraph", content: "Drop me" }).id;
    editor.load({
      ...editor.dump(),
      rootElementIds: [],
      blocks: [editor.blocks.getBlock(boardId)!, editor.blocks.getBlock(sourceId)!],
      elements: [],
    });
  });
  const board = page.locator('[data-block-type="bento"]');
  const tiles = board.locator(BENTO_TILES_SELECTOR);
  const source = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Drop me", { exact: true }) })
    .first();
  const handle = source.locator(`:scope > .${ROW_CLASS} .${PAGE_DRAG_HANDLE_CLASS}`);
  await source.hover();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  const to = (await board.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 20, { steps: 15 });
  await page.mouse.up();
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toContainText("Drop me");
});

test("Escape cancels a Bento resize while retaining its expanded panel", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
    editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
  });
  const board = page.locator('[data-block-type="bento"]');
  await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
  const tile = board.locator(BENTO_ITEMS_SELECTOR).first();
  const before = (await tile.boundingBox())!;
  await tile.hover();
  const handle = tile.getByRole("separator", { name: RESIZE_RIGHT });
  const origin = (await handle.boundingBox())!;
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2 + 80, origin.y + origin.height / 2, {
    steps: 8,
  });
  await expect(tile).toHaveAttribute("data-bento-resizing", "right");
  await page.keyboard.press("Escape");
  await expect(tile).not.toHaveAttribute("data-bento-resizing");
  await expect(page.getByRole("dialog", { name: /^Expanded / })).toBeVisible();
  await page.mouse.up();
  expect((await tile.boundingBox())!.width).toBeCloseTo(before.width, 1);
  await expect(handle).not.toHaveAttribute("data-resizing");
});
