/**
 * Keyboard block dragging resolves placement without any cursor.
 *
 * The pointer path reads live viewport coordinates, so the keyboard path is
 * the only consumer of dnd-kit's translated draggable rectangle. It must keep
 * producing sibling insertions and must leave the document untouched when the
 * gesture is cancelled.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR } from "./dom-markers";

/** Today's journal document; the demo also mounts an empty second editor. */
const today = (page: Page): Locator => page.locator('[data-journal-document="today"]');

/** @returns Root block IDs of one editor in document order. */
function rootIds(editor: Locator): Promise<string[]> {
  return editor.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`)
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.blockId ?? ""));
}

/**
 * Picks up the first root block with the keyboard and steps it downward.
 *
 * Focus arms the handle, which is what registers the dnd-kit draggable, so the
 * armed attribute is awaited before the activation key.
 *
 * @param page - Page owning the keyboard.
 * @param editor - Journal document to drag inside.
 * @param steps - Number of downward moves to request.
 * @returns Root IDs captured before the gesture began.
 */
async function pickUpFirstRoot(page: Page, editor: Locator, steps: number): Promise<string[]> {
  const before = await rootIds(editor);
  const handle = editor.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`).first()
    .locator(":scope > .page-block-row .page-drag-handle");
  await handle.focus();
  await expect(handle).toHaveAttribute("aria-roledescription", "draggable");
  await page.keyboard.press("Space");
  await expect(page.locator(".page-drag-overlay")).toBeVisible();
  for (let step = 0; step < steps; step += 1) await page.keyboard.press("ArrowDown");
  return before;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("moves a block to a later sibling position with the keyboard", async ({ page }) => {
  const editor = today(page);
  const before = await pickUpFirstRoot(page, editor, 2);
  const second = editor.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`).nth(1);

  // Without a cursor the stand-in rectangle sits over a row body, and the
  // cursor-free branch must still choose a gap rather than nesting the block.
  const line = second.locator(":scope > .page-block-row > .page-drop-line");
  await expect(line).toHaveAttribute("data-edge", "after");
  await expect(page.locator("[data-drop-inside]")).toHaveCount(0);

  await page.keyboard.press("Space");
  await expect(page.locator(".page-drag-overlay")).toHaveCount(0);
  expect(await rootIds(editor)).toEqual([before[1], before[0], ...before.slice(2)]);
  await expect(editor.locator(`${BLOCK_ID_SELECTOR}[data-block-id="${before[0]}"] .page-block-children`))
    .toHaveCount(0);
});

test("leaves the document unchanged when a keyboard drag is cancelled", async ({ page }) => {
  const editor = today(page);
  const before = await pickUpFirstRoot(page, editor, 2);

  await page.keyboard.press("Escape");
  await expect(page.locator(".page-drag-overlay")).toHaveCount(0);
  await expect(page.locator(".page-drop-line")).toHaveCount(0);
  expect(await rootIds(editor)).toEqual(before);
});

test("keeps the first root in place when the handle never moves", async ({ page }) => {
  const editor = today(page);
  const before = await pickUpFirstRoot(page, editor, 0);

  await page.keyboard.press("Space");
  await expect(page.locator(".page-drag-overlay")).toHaveCount(0);
  expect(await rootIds(editor)).toEqual(before);
  await expect(editor.locator(BLOCK_ID_SELECTOR).first()).toHaveAttribute(BLOCK_ID_ATTRIBUTE, before[0]!);
});
