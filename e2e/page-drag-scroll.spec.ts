/**
 * Pointer drops must follow the visible cursor, never the scroll offset.
 *
 * dnd-kit folds the distance scrolled since activation into the movement
 * delta, so reconstructing the cursor from the activator event drifts by that
 * distance. Page drop targets are hit-tested against viewport rectangles, so
 * the drift selected a row far below the visible cursor. Each test here moves
 * the surface by a different mechanism — wheel, dnd-kit auto-scroll, and a
 * programmatic scroll — because all three feed the same adjustment.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR, blockIdSelector } from "./dom-markers";

/** Leaf root paragraph far enough down the demo document to require scrolling. */
const TARGET_CONTENT = "Ordinary content between numbered items";

/** Horizontal pixels representing one nesting level in the after-row gap. */
const CHILD_DROP_INDENT = 24;

/** Today's journal document; the demo also mounts an empty second editor. */
const today = (page: Page): Locator => page.locator('[data-journal-document="today"]');

/** @returns Root block IDs of one editor in document order. */
function rootIds(editor: Locator): Promise<string[]> {
  return editor.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`)
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.blockId ?? ""));
}

/**
 * Reads the block currently showing drag feedback, whichever form it takes.
 *
 * A gap insertion renders a line and a body insertion sets an attribute, and
 * both decorate the row owned by the resolved block.
 *
 * @param page - Page running the active gesture.
 * @returns Block ID owning the indicator, or null while feedback is absent.
 */
function dropFeedbackOwner(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const decorated = document.querySelector(".page-drop-line") ?? document.querySelector("[data-drop-inside]");
    const block = decorated?.closest<HTMLElement>("[data-block-id]");
    return block?.dataset.blockId ?? null;
  });
}

/**
 * Asks the browser's own hit test which block sits under a viewport point.
 *
 * Auto-scroll stops wherever its interval left the surface, so the expected
 * target cannot be named up front. This supplies it independently of the
 * extension: the drop must agree with what the user sees under the cursor.
 *
 * @param page - Page to hit-test.
 * @param point - Viewport coordinates of the cursor.
 * @returns Innermost block ID at that point, or null over blank space.
 */
function blockUnderCursor(page: Page, point: { x: number; y: number }): Promise<string | null> {
  return page.evaluate(({ x, y }) => {
    const block = document.elementsFromPoint(x, y)
      .map((element) => element.closest<HTMLElement>("[data-block-id]"))
      .find((element) => element?.closest(".page-surface"));
    return block?.dataset.blockId ?? null;
  }, point);
}

/**
 * Arms one block's handle and holds a gesture with the cursor mid-viewport.
 *
 * The handle only accepts pointer events while its row is hovered, so the row
 * is hovered first. Mid-viewport is both past dnd-kit's activation distance
 * and outside its auto-scroll threshold, which leaves each test in control of
 * how far the surface moves.
 *
 * @param page - Page owning the pointer.
 * @param block - Block whose handle starts the gesture.
 * @returns Viewport coordinates the cursor now rests at.
 */
async function holdDragMidViewport(page: Page, block: Locator): Promise<{ x: number; y: number }> {
  const row = block.locator(":scope > .page-block-row");
  const handle = block.locator(":scope > .page-block-row .page-drag-handle");
  await block.hover();
  await handle.hover();
  await expect(handle).toHaveAttribute("aria-roledescription", "draggable");
  const handleBox = (await handle.boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  // The handle overhangs the left gutter, which is outside every row's own
  // rectangle. Parking over the content column keeps the cursor on a row.
  const cursor = { x: rowBox.x + rowBox.width / 2, y: page.viewportSize()!.height / 2 };
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cursor.x, cursor.y, { steps: 5 });
  await expect(page.locator(".page-drag-overlay")).toBeVisible();
  return cursor;
}

/**
 * Wheel-scrolls until one row's center reaches the held cursor's height.
 *
 * @param page - Page owning the pointer.
 * @param row - Row that should end up under the cursor.
 * @param cursorY - Viewport height the cursor is parked at.
 * @returns No value.
 */
async function scrollRowToCursor(page: Page, row: Locator, cursorY: number): Promise<void> {
  const before = (await row.boundingBox())!;
  const scrollBy = Math.round(before.y + before.height / 2 - cursorY);
  // A short scroll would leave the drifted and correct targets on the same
  // row, which would let the original defect pass unnoticed.
  expect(scrollBy).toBeGreaterThan(200);
  await page.mouse.wheel(0, scrollBy);
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(200);
}

test.describe("page drag with a scrolling window", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("drops onto the row under the cursor after scrolling mid-drag", async ({ page }) => {
    const editor = today(page);
    const source = editor.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`).first();
    const sourceId = (await source.getAttribute(BLOCK_ID_ATTRIBUTE))!;
    const target = editor.locator("[data-block-content]")
      .filter({ hasText: new RegExp(`^${TARGET_CONTENT}$`) })
      .locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
    const targetRow = target.locator(":scope > .page-block-row");

    const cursor = await holdDragMidViewport(page, source);
    await scrollRowToCursor(page, targetRow, cursor.y);

    const afterScroll = (await targetRow.boundingBox())!;
    await page.mouse.move(afterScroll.x + afterScroll.width / 2, afterScroll.y + afterScroll.height / 2, { steps: 5 });
    await expect(targetRow).toHaveAttribute("data-drop-inside", "true");
    await expect(page.locator("[data-drop-inside]")).toHaveCount(1);

    await page.mouse.up();
    await expect(target.locator(blockIdSelector(sourceId))).toHaveCount(1);
  });

  test("retargets and commits for a row scrolled under a stationary cursor", async ({ page }) => {
    const editor = today(page);
    const source = editor.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`).first();
    const sourceId = (await source.getAttribute(BLOCK_ID_ATTRIBUTE))!;
    const target = editor.locator("[data-block-content]")
      .filter({ hasText: new RegExp(`^${TARGET_CONTENT}$`) })
      .locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
    const targetId = (await target.getAttribute(BLOCK_ID_ATTRIBUTE))!;
    const targetRow = target.locator(":scope > .page-block-row");

    const cursor = await holdDragMidViewport(page, source);
    expect(await dropFeedbackOwner(page)).not.toBe(targetId);

    // The cursor never moves again. Only the content slides beneath it, so
    // scroll alone has to retarget the drop and the release has to honour it.
    await scrollRowToCursor(page, targetRow, cursor.y);
    await expect(targetRow).toHaveAttribute("data-drop-inside", "true");
    await expect(page.locator("[data-drop-inside]")).toHaveCount(1);

    await page.mouse.up();
    await expect(target.locator(blockIdSelector(sourceId))).toHaveCount(1);
  });

  test("keeps the target aligned while dnd-kit auto-scrolls at the edge", async ({ page }) => {
    const editor = today(page);
    const source = editor.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`).first();
    const viewport = page.viewportSize()!;
    const cursor = await holdDragMidViewport(page, source);

    // Inside the bottom threshold dnd-kit scrolls the window on an interval,
    // without any further pointer movement to explain the change.
    await page.mouse.move(cursor.x, viewport.height - 12, { steps: 5 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(150);

    // Returning to the middle stops the interval so the surface settles.
    await page.mouse.move(cursor.x, cursor.y, { steps: 5 });
    await page.waitForTimeout(300);
    const settled = await page.evaluate(() => window.scrollY);
    const expected = await blockUnderCursor(page, cursor);
    expect(expected).not.toBeNull();
    await expect.poll(() => dropFeedbackOwner(page)).toBe(expected);
    expect(await page.evaluate(() => window.scrollY)).toBe(settled);
    await page.mouse.up();
  });

  // The gap under a leaf row spans every depth its cursor distance allows, so
  // a drifting cursor would corrupt the chosen level as well as the chosen row.
  for (const depth of [0, 1] as const) {
    test(`resolves gap depth ${depth} from the cursor after scrolling mid-drag`, async ({ page }) => {
      const editor = today(page);
      const source = editor.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`).first();
      const sourceId = (await source.getAttribute(BLOCK_ID_ATTRIBUTE))!;
      const target = editor.locator("[data-block-content]")
        .filter({ hasText: new RegExp(`^${TARGET_CONTENT}$`) })
        .locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
      const targetId = (await target.getAttribute(BLOCK_ID_ATTRIBUTE))!;
      const targetRow = target.locator(":scope > .page-block-row");

      const cursor = await holdDragMidViewport(page, source);
      await scrollRowToCursor(page, targetRow, cursor.y);

      // Half an indent past the requested level keeps the reading clear of
      // both truncation boundaries.
      const afterScroll = (await targetRow.boundingBox())!;
      await page.mouse.move(
        afterScroll.x + (depth + 0.5) * CHILD_DROP_INDENT,
        afterScroll.y + afterScroll.height - 2,
        { steps: 5 },
      );

      const line = targetRow.locator(".page-drop-line");
      await expect(line).toHaveAttribute("data-edge", "after");
      await expect(line).toHaveCSS("left", `${depth * CHILD_DROP_INDENT}px`);

      await page.mouse.up();
      if (depth === 0) {
        const ids = await rootIds(editor);
        expect(ids[ids.indexOf(targetId) + 1]).toBe(sourceId);
      } else {
        await expect(target.locator(`:scope > .page-block-children > ${BLOCK_ID_SELECTOR}`).first())
          .toHaveAttribute(BLOCK_ID_ATTRIBUTE, sourceId);
      }
    });
  }
});

test.describe("cross-document drag with a scrolling window", () => {
  // A short viewport makes the side-by-side demo page scrollable.
  test.use({ viewport: { width: 1280, height: 400 } });

  test("targets the cross-document row under the cursor after scrolling", async ({ page }) => {
    await page.goto("/?editors=2");
    const left = page.locator('[data-multi-editor="left"]');
    const right = page.locator('[data-multi-editor="right"]');
    const scrollable = await page.evaluate(() => (
      document.documentElement.scrollHeight - document.documentElement.clientHeight
    ));
    expect(scrollable).toBeGreaterThan(100);

    const targetRow = right.locator(`${blockIdSelector("right-nested")} > .page-block-row`);
    await holdDragMidViewport(page, left.locator(blockIdSelector("left-counter")));

    await page.evaluate((top) => window.scrollTo({ top }), scrollable);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(scrollable);

    const afterScroll = (await targetRow.boundingBox())!;
    await page.mouse.move(afterScroll.x + afterScroll.width / 2, afterScroll.y + afterScroll.height / 2, { steps: 5 });
    await expect(targetRow).toHaveAttribute("data-drop-inside", "true");

    await page.mouse.up();
    await expect(right.locator(`${blockIdSelector("right-nested")} ${blockIdSelector("left-counter")}`)).toHaveCount(1);
    await expect(left.locator(blockIdSelector("left-counter"))).toHaveCount(0);
  });
});
