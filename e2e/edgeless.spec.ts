import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  blockIdSelector,
  blockTypeSelector,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  BLOCK_SELECTED_ATTRIBUTE,
  BLOCK_SELECTED_SELECTOR,
} from "./dom-markers";

const switchMode = async (page: Page, mode: "block" | "edgeless") => {
  await page.locator(`[data-editor-mode="${mode}"]`).click();
};

const cardChrome = (card: Locator) => card.locator(":scope > .edgeless-card-header");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("renders every root as one card with its complete nested outline", async ({ page }) => {
  const pageRoots = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`);
  const rootCount = await pageRoots.count();
  const parent = page.locator(".page-block:has(> .page-block-children)").first();
  const parentId = await parent.getAttribute(BLOCK_ID_ATTRIBUTE);
  const childId = await parent.locator(`:scope > .page-block-children ${BLOCK_ID_SELECTOR}`).first().getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!parentId || !childId) throw new Error("Expected nested page IDs");
  await parent.locator(":scope > .page-block-row [data-collapse-toggle]").click();

  await switchMode(page, "edgeless");
  await expect(page.locator("[data-edgeless-root]")).toHaveCount(rootCount);
  const card = page.locator(`[data-edgeless-root="${parentId}"]`);
  await expect(card.locator(blockIdSelector(childId))).toHaveCount(1);
  await expect(card.locator("[data-collapse-toggle]")).toHaveCount(0);
  await expect.poll(() => card.locator(".edgeless-card-body").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  await switchMode(page, "block");
  await expect(page.locator(`${blockIdSelector(parentId)} > .page-block-children`)).toHaveCount(0);
});

test("reuses Tab and Shift+Tab inside a canvas card", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const rootBlock = card.locator(":scope > .edgeless-card-body > .page-block");
  const directChildren = rootBlock.locator(":scope > .page-block-children > .page-block");
  const firstId = await directChildren.first().getAttribute(BLOCK_ID_ATTRIBUTE);
  const second = directChildren.nth(1);
  const secondId = await second.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!firstId || !secondId) throw new Error("Expected sibling blocks");

  await second.locator(":scope > .page-block-row [data-block-content]").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  const first = rootBlock.locator(`.page-block${blockIdSelector(firstId!)}`);
  await expect(first.locator(`:scope > .page-block-children > ${blockIdSelector(secondId!)}`)).toHaveCount(1);

  await first.locator(`${blockIdSelector(secondId!)} > .page-block-row [data-block-content]`).click();
  await page.keyboard.press("Shift+Tab");
  await expect(rootBlock.locator(`:scope > .page-block-children > ${blockIdSelector(secondId!)}`)).toHaveCount(1);
});

test("reuses page Enter and structural drag inside a canvas card", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const rootBlock = card.locator(":scope > .edgeless-card-body > .page-block");
  const directChildren = rootBlock.locator(":scope > .page-block-children > .page-block");
  const before = await directChildren.count();
  const allBlocks = page.locator(BLOCK_ID_SELECTOR);
  const totalBefore = await allBlocks.count();

  await rootBlock.locator(":scope > .page-block-row [data-block-content]").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(allBlocks).toHaveCount(totalBefore + 1);
  await expect(directChildren).toHaveCount(before + 1);

  const source = directChildren.first();
  const target = directChildren.nth(1);
  const sourceId = await source.getAttribute(BLOCK_ID_ATTRIBUTE);
  const targetId = await target.getAttribute(BLOCK_ID_ATTRIBUTE);
  const handleBox = await source.locator(":scope > .page-block-row .page-drag-handle").boundingBox();
  const targetBox = await target.locator(":scope > .page-block-row").boundingBox();
  if (!sourceId || !targetId || !handleBox || !targetBox) throw new Error("Expected nested drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
  const movedTarget = rootBlock.locator(`.page-block${blockIdSelector(targetId!)}`);
  await expect(movedTarget.locator(`:scope > .page-block-children > ${blockIdSelector(sourceId!)}`)).toHaveCount(1);
});

test("edits Markdown and custom controls without selecting their root cards", async ({ page }) => {
  await switchMode(page, "edgeless");
  const first = page.locator("[data-edgeless-root]").first();
  const content = first.locator("[data-block-content]").first();
  await expect(first.locator(".markdown-preview strong")).toHaveText("Rivto editor");
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!/sloder");
  await expect(page.locator('[data-slash-command="type.demo.slider"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(first).not.toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");

  const slider = page.locator(`[data-edgeless-root]${blockTypeSelector("demo.slider")} input`);
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("36");
  const counter = page.locator(`[data-edgeless-root]${blockTypeSelector("demo.counter")} .custom-counter-block`);
  await counter.click();
  await expect(counter).toHaveText("Count: 3");

  await switchMode(page, "block");
  await expect(page.locator("[data-block-content]").first()).toHaveText("**Rivto editor**!/sloder");
});

test("toggles root selection and moves or resizes layouts atomically", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const first = cards.nth(0);
  const second = cards.nth(1);
  await cardChrome(first).click({ position: { x: 280, y: 14 } });
  await cardChrome(second).click({ modifiers: ["Control"], position: { x: 280, y: 14 } });
  await expect(page.locator(`[data-edgeless-root]${BLOCK_SELECTED_SELECTOR}`)).toHaveCount(2);

  const before = await Promise.all([first, second].map((card) => card.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
    width: Number.parseFloat((element as HTMLElement).style.width),
  }))));
  const handle = first.locator("[data-edgeless-drag-handle]");
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Expected move handle geometry");
  await page.mouse.move(handleBox.x + 5, handleBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 55, handleBox.y + 35, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => first.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(before[0]!.left + 50);
  await expect.poll(() => second.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top))).toBe(before[1]!.top + 30);

  await page.keyboard.press("Control+z");
  await expect.poll(() => first.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(before[0]!.left);

  const resize = second.locator("[data-edgeless-resize-handle]");
  const resizeBox = await resize.boundingBox();
  if (!resizeBox) throw new Error("Expected resize handle geometry");
  await page.mouse.move(resizeBox.x + 5, resizeBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 35, resizeBox.y + 25, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => second.evaluate((element) => Number.parseFloat((element as HTMLElement).style.width))).toBe(before[1]!.width + 30);
});

test("rectangle-selects roots, moves them by keyboard, and deletes them atomically", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const beforeCount = await cards.count();
  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  if (!firstBox || !secondBox) throw new Error("Expected root card geometry");
  await page.mouse.move(firstBox.x - 5, firstBox.y - 5);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width + 5, secondBox.y + secondBox.height + 5, { steps: 8 });
  await expect(page.locator("[data-edgeless-selection-rectangle]")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(`[data-edgeless-root]${BLOCK_SELECTED_SELECTOR}`)).toHaveCount(2);

  const left = await cards.nth(0).evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => cards.nth(0).evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(left + 10);
  await page.keyboard.press("Delete");
  await expect(cards).toHaveCount(beforeCount - 2);
  await page.keyboard.press("Control+z");
  await expect(cards).toHaveCount(beforeCount);
});

test("zooms, pans, and pastes selected root subtrees with offset layouts", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText("110%");
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText("100%");

  const box = await viewport.boundingBox();
  if (!box) throw new Error("Expected viewport geometry");
  await viewport.focus();
  await page.keyboard.down("Space");
  await page.mouse.move(box.x + box.width - 30, box.y + box.height - 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 150, box.y + box.height - 100, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  await viewport.evaluate((element) => { element.scrollLeft = 0; element.scrollTop = 0; });
  const cards = page.locator("[data-edgeless-root]");
  const before = await cards.count();
  const originalPositions = await Promise.all([cards.nth(0), cards.nth(1)].map((card) => card.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))));
  await cardChrome(cards.nth(0)).click({ position: { x: 280, y: 14 } });
  await cardChrome(cards.nth(1)).click({ modifiers: ["Control"], position: { x: 280, y: 14 } });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(cards).toHaveCount(before + 2);
  await expect(page.locator(`[data-edgeless-root]${BLOCK_SELECTED_SELECTOR}`)).toHaveCount(1);
  const pastedPositions = await Promise.all([cards.nth(2), cards.nth(3)].map((card) => card.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))));
  expect(pastedPositions).toEqual(originalPositions.map(({ left, top }) => ({ left: left + 24, top: top + 24 })));
});

test("duplicates a complete root subtree from slash with offset geometry", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const original = cards.filter({ has: page.locator(".page-block-children") }).first();
  const originalId = await original.getAttribute("data-edgeless-root");
  const originalPosition = await original.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }));
  const originalDescendants = await original.locator(BLOCK_ID_SELECTOR).count();
  const before = await cards.count();

  const content = original.locator("[data-block-content]").first();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/dupl");
  await page.locator('[data-slash-command="block.duplicate"]').click();

  await expect(cards).toHaveCount(before + 1);
  const duplicate = page.locator(`[data-edgeless-root]${BLOCK_SELECTED_SELECTOR}`);
  await expect(duplicate).toHaveCount(1);
  await expect(duplicate).not.toHaveAttribute("data-edgeless-root", originalId ?? "");
  await expect(duplicate.locator(BLOCK_ID_SELECTOR)).toHaveCount(originalDescendants);
  await expect.poll(() => duplicate.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))).toEqual({ left: originalPosition.left + 24, top: originalPosition.top + 24 });
});
