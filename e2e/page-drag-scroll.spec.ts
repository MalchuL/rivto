/**
 * Scrolling mid-drag must not shift the resolved drop target.
 *
 * dnd-kit folds the distance scrolled since activation into the movement
 * delta, so reconstructing the cursor from the activator event drifts by that
 * distance. Page drop targets are hit-tested against viewport rectangles, so
 * the drift used to select a row far below the visible cursor.
 */
import { expect, test } from "@playwright/test";
import { BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR, blockIdSelector } from "./dom-markers";

/** Leaf root paragraph far enough down the demo document to require scrolling. */
const TARGET_CONTENT = "Ordinary content between numbered items";

test("drops onto the row under the cursor after scrolling mid-drag", async ({ page }) => {
  await page.goto("/");
  const viewport = page.viewportSize()!;
  const source = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`).first();
  const sourceId = (await source.getAttribute(BLOCK_ID_ATTRIBUTE))!;
  const target = page.locator("[data-block-content]")
    .filter({ hasText: new RegExp(`^${TARGET_CONTENT}$`) })
    .locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const targetRow = target.locator(":scope > .page-block-row");

  const handle = source.locator(":scope > .page-block-row .page-drag-handle");
  await source.hover();
  await handle.hover();
  const handleBox = (await handle.boundingBox())!;
  const cursorX = handleBox.x + handleBox.width / 2;
  await page.mouse.move(cursorX, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  // Park the cursor mid-viewport before scrolling so dnd-kit's edge auto-scroll
  // stays idle and the wheel remains the only source of movement.
  await page.mouse.move(cursorX, viewport.height / 2, { steps: 5 });
  await expect(page.locator(".page-drag-overlay")).toBeVisible();

  const beforeScroll = (await targetRow.boundingBox())!;
  const scrollBy = Math.round(beforeScroll.y + beforeScroll.height / 2 - viewport.height / 2);
  expect(scrollBy).toBeGreaterThan(200);
  await page.mouse.wheel(0, scrollBy);
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(200);

  const afterScroll = (await targetRow.boundingBox())!;
  await page.mouse.move(afterScroll.x + afterScroll.width / 2, afterScroll.y + afterScroll.height / 2, { steps: 5 });
  await expect(targetRow).toHaveAttribute("data-drop-inside", "true");
  await expect(page.locator("[data-drop-inside]")).toHaveCount(1);

  await page.mouse.up();
  await expect(target.locator(blockIdSelector(sourceId))).toHaveCount(1);
});
