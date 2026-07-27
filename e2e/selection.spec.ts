import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  BLOCK_SELECTED_ATTRIBUTE,
  BLOCK_SELECTED_SELECTOR,
  blockTypeSelector,
} from "./dom-markers";

const BLOCK_ANCESTOR_XPATH = `xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`;

async function textPoint(content: Locator, offset: number): Promise<{ x: number; y: number }> {
  return content.evaluate((element, requestedOffset) => {
    const node = element.firstChild;
    if (!node) throw new Error("Expected editable text");
    const length = node.textContent?.length ?? 0;
    const safeOffset = Math.max(0, Math.min(requestedOffset, length));
    const range = document.createRange();
    const fromPrevious = safeOffset === length && length > 0;
    range.setStart(node, fromPrevious ? safeOffset - 1 : safeOffset);
    range.setEnd(node, fromPrevious ? safeOffset : Math.min(length, safeOffset + 1));
    const rect = range.getBoundingClientRect();
    return { x: fromPrevious ? rect.right - 1 : rect.left + 1, y: rect.top + rect.height / 2 };
  }, offset);
}

async function dragText(page: Page, start: Locator, startOffset: number, end: Locator, endOffset: number): Promise<void> {
  const from = await textPoint(start, startOffset);
  const to = await textPoint(end, endOffset);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("switches cross-block drag to blocks and restores text on return", async ({ page }) => {
  const contents = page.locator("[data-block-content]");
  const first = contents.nth(0);
  const second = contents.nth(1);
  await dragText(page, first, 2, second, 8);
  await expect(first.locator(BLOCK_ANCESTOR_XPATH)).toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
  await expect(second.locator(BLOCK_ANCESTOR_XPATH)).toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");

  await page.reload();
  const start = page.locator("[data-block-content]").nth(0);
  const next = page.locator("[data-block-content]").nth(1);
  const from = await textPoint(start, 2);
  const source = await start.textContent();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await expect(start).toBeFocused();
  // Pointer-down replaces the formatted preview with raw Markdown. Resolve
  // movement coordinates from the geometry the user actually sees afterward.
  const across = await textPoint(next, 5);
  const back = await textPoint(start, 8);
  await page.mouse.move(across.x, across.y, { steps: 6 });
  await page.mouse.move(back.x, back.y, { steps: 6 });
  await page.mouse.up();
  const readSelection = () => page.evaluate(({ attribute, selector }) => {
    const selection = getSelection();
    const endpoint = (node: Node | null, offset: number | undefined) => {
      const element = node instanceof Element ? node : node?.parentElement;
      const content = element?.closest<HTMLElement>("[data-block-content]");
      const blockId = element?.closest<HTMLElement>(selector)?.getAttribute(attribute);
      if (!content || !node || offset === undefined) return { blockId };
      const range = document.createRange();
      range.selectNodeContents(content);
      range.setEnd(node, offset);
      return { blockId, offset: range.toString().length };
    };
    return {
      anchor: endpoint(selection?.anchorNode ?? null, selection?.anchorOffset),
      focus: endpoint(selection?.focusNode ?? null, selection?.focusOffset),
      text: selection?.toString(),
    };
  }, { attribute: BLOCK_ID_ATTRIBUTE, selector: BLOCK_ID_SELECTOR });
  const blockId = await start.locator(BLOCK_ANCESTOR_XPATH).getAttribute(BLOCK_ID_ATTRIBUTE);
  const expected = {
    anchor: { blockId, offset: 2 },
    focus: { blockId, offset: 8 },
    text: source?.slice(2, 8),
  };

  await expect.poll(readSelection).toEqual(expected);
  // Chromium and Firefox may publish another native selectionchange after
  // pointerup. The final range must remain identical after that browser task.
  await page.waitForTimeout(100);
  expect(await readSelection()).toEqual(expected);
});

test("Alt drag keeps partial text across blocks", async ({ page }) => {
  const contents = page.locator("[data-block-content]");
  await page.keyboard.down("Alt");
  await dragText(page, contents.nth(0), 2, contents.nth(1), 8);
  await page.keyboard.up("Alt");
  await expect(contents.nth(0).locator(BLOCK_ANCESTOR_XPATH)).not.toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
  await expect.poll(() => page.evaluate(() => getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
});

test("dragging onto a contentless Counter immediately extends block selection", async ({ page }) => {
  const counter = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.counter")}`);
  const nextContent = counter.locator("xpath=following::*[@data-block-content][1]");
  const from = await textPoint(nextContent, 5);
  const counterBox = await counter.boundingBox();
  if (!counterBox) throw new Error("Expected Counter geometry");

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(
    counterBox.x + counterBox.width / 2,
    counterBox.y + counterBox.height / 2,
    { steps: 8 },
  );

  // Assert while the pointer is still down. Previously Counter was skipped
  // until the cursor reached another block containing editable text.
  await expect(counter).toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
  await expect(nextContent.locator(BLOCK_ANCESTOR_XPATH)).toHaveAttribute(
    BLOCK_SELECTED_ATTRIBUTE,
    "true",
  );
  await page.mouse.up();
  await expect(counter).toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
  await expect(nextContent.locator(BLOCK_ANCESTOR_XPATH)).toHaveAttribute(
    BLOCK_SELECTED_ATTRIBUTE,
    "true",
  );
});

test("dragging from a contentless Counter anchors selection without incrementing it", async ({ page }) => {
  const counter = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.counter")}`);
  const button = counter.locator(".custom-counter-block");
  const nextContent = counter.locator("xpath=following::*[@data-block-content][1]");
  const counterBox = await button.boundingBox();
  const to = await textPoint(nextContent, 5);
  if (!counterBox) throw new Error("Expected Counter geometry");

  await page.mouse.move(
    counterBox.x + counterBox.width / 2,
    counterBox.y + counterBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(counter).toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
  await expect(nextContent.locator(BLOCK_ANCESTOR_XPATH)).toHaveAttribute(
    BLOCK_SELECTED_ATTRIBUTE,
    "true",
  );
  await page.mouse.up();

  await expect(counter).toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
  await expect(nextContent.locator(BLOCK_ANCESTOR_XPATH)).toHaveAttribute(
    BLOCK_SELECTED_ATTRIBUTE,
    "true",
  );
  await expect(button).toHaveText("Count: 2");
});

test("dragging within a contentless Counter selects only that block", async ({ page }) => {
  const counter = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.counter")}`);
  const button = counter.locator(".custom-counter-block");
  const box = await button.boundingBox();
  if (!box) throw new Error("Expected Counter geometry");

  await page.mouse.move(box.x + box.width / 2 - 6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();

  await expect(counter).toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
  await expect(page.locator(BLOCK_SELECTED_SELECTOR)).toHaveCount(1);
  await expect(button).toHaveText("Count: 2");
});

test("dragging from the empty right side of Counter starts structural selection", async ({ page }) => {
  const counter = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.counter")}`);
  const region = counter.locator(".custom-counter-selection-region");
  const button = counter.locator(".custom-counter-block");
  const nextContent = counter.locator("xpath=following::*[@data-block-content][1]");
  const regionBox = await region.boundingBox();
  const buttonBox = await button.boundingBox();
  const to = await textPoint(nextContent, 5);
  if (!regionBox || !buttonBox) throw new Error("Expected Counter geometry");
  expect(regionBox.x + regionBox.width).toBeGreaterThan(buttonBox.x + buttonBox.width + 20);

  await page.mouse.move(regionBox.x + regionBox.width - 8, regionBox.y + regionBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();

  await expect(counter).toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
  await expect(nextContent.locator(BLOCK_ANCESTOR_XPATH)).toHaveAttribute(
    BLOCK_SELECTED_ATTRIBUTE,
    "true",
  );
  await expect(button).toHaveText("Count: 2");
});

test("Shift click ranges complete blocks", async ({ page }) => {
  const contents = page.locator("[data-block-content]");
  await contents.nth(0).click();
  await contents.nth(2).click({ modifiers: ["Shift"] });
  await expect(page.locator(BLOCK_SELECTED_SELECTOR)).toHaveCount(3);
});

test("Ctrl click toggles blocks with a pointer cursor", async ({ page }) => {
  const contents = page.locator("[data-block-content]");
  await contents.nth(0).click({ modifiers: ["Control"] });
  await contents.nth(1).click({ modifiers: ["Control"] });
  await expect(page.locator(BLOCK_SELECTED_SELECTOR)).toHaveCount(2);
  await page.keyboard.down("Control");
  await expect(contents.nth(1)).toHaveCSS("cursor", "pointer");
  await page.keyboard.up("Control");
  await contents.nth(1).click({ modifiers: ["Control"] });
  await expect(contents.nth(1).locator(BLOCK_ANCESTOR_XPATH)).not.toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
});

test("selecting a parent draws one selection rectangle around its subtree", async ({ page }) => {
  const parent = page.locator(".page-block:has(> .page-block-children)").first();
  const child = parent.locator(`.page-block-children ${BLOCK_ID_SELECTOR}`).last();
  await parent.locator(":scope > .page-block-row [data-block-content]").click({ modifiers: ["Control"] });

  await expect(parent).toHaveAttribute(BLOCK_SELECTED_ATTRIBUTE, "true");
  await expect(parent).toHaveCSS("background-color", "rgb(229, 223, 255)");
  const parentBox = await parent.boundingBox();
  const childBox = await child.boundingBox();
  if (!parentBox || !childBox) throw new Error("Expected selected subtree geometry");
  expect(parentBox.y).toBeLessThanOrEqual(childBox.y);
  expect(parentBox.y + parentBox.height).toBeGreaterThanOrEqual(childBox.y + childBox.height);
});

test("Alt selects block ranges and Alt+Shift moves a block", async ({ page }) => {
  const contents = page.locator("[data-block-content]");
  const firstText = await contents.nth(0).textContent();
  await contents.nth(0).click();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.locator(BLOCK_SELECTED_SELECTOR)).toHaveCount(1);
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.locator(BLOCK_SELECTED_SELECTOR)).toHaveCount(2);
  await page.keyboard.press("Alt+ArrowUp");
  await expect(page.locator(BLOCK_SELECTED_SELECTOR)).toHaveCount(1);
  await page.keyboard.press("Alt+Shift+ArrowDown");
  await expect(page.locator("[data-block-content]").nth(1)).toHaveText(firstText ?? "");
});

test("Shift+Tab outdents multiple selected sibling blocks", async ({ page }) => {
  const blocks = page.locator(BLOCK_ID_SELECTOR);
  const first = blocks.nth(5);
  const second = blocks.nth(8);
  const parentId = await first.locator(BLOCK_ANCESTOR_XPATH).getAttribute(BLOCK_ID_ATTRIBUTE);
  expect(parentId).toBeTruthy();
  await expect(second.locator(BLOCK_ANCESTOR_XPATH)).toHaveAttribute(BLOCK_ID_ATTRIBUTE, parentId!);

  await first.locator(":scope > .page-block-row [data-block-content]").click({ modifiers: ["Control"] });
  await second.locator(":scope > .page-block-row [data-block-content]").click({ modifiers: ["Control"] });
  await page.keyboard.press("Shift+Tab");

  await expect(first.locator(BLOCK_ANCESTOR_XPATH)).toHaveCount(0);
  await expect(second.locator(BLOCK_ANCESTOR_XPATH)).toHaveCount(0);
  await expect(page.locator(BLOCK_SELECTED_SELECTOR)).toHaveCount(2);
});

test("Down follows wrapped visual lines at approximately the same x", async ({ page }) => {
  await page.locator(".page-surface").evaluate((element) => { element.style.width = "300px"; });
  const content = page.locator("[data-block-content]").nth(1);
  const point = await textPoint(content, 8);
  await page.mouse.click(point.x, point.y);
  const before = await page.evaluate(() => getSelection()?.getRangeAt(0).getBoundingClientRect().left ?? 0);
  await page.keyboard.press("ArrowDown");
  const after = await page.evaluate(() => getSelection()?.getRangeAt(0).getBoundingClientRect().left ?? 0);
  expect(Math.abs(after - before)).toBeLessThan(40);
});
