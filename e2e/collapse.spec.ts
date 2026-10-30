import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  HOST_BLOCK_ID_SELECTOR,
  ROOT_BLOCK_SELECTOR,
  blockIdSelector,
} from "./dom-markers";

interface ClipboardBlock {
  children: ClipboardBlock[];
}

/** Returns a stable ID-based locator that still resolves after children unmount. */
async function collapsibleRoot(page: Page, index = 0): Promise<Locator> {
  const surface = '[data-journal-document="today"] > .page-surface';
  const candidate = page
    .locator(`${surface} ${ROOT_BLOCK_SELECTOR}:has(> .rivto-block-children)`)
    .nth(index);
  const id = await candidate.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!id) {
    throw new Error("Expected collapsible root ID");
  }
  return page.locator(`${surface} ${ROOT_BLOCK_SELECTOR}${blockIdSelector(id)}`);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("toggles an accessible collapsed subtree without exposing hidden rows", async ({ page }) => {
  const parent = await collapsibleRoot(page);
  const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
  const leftTopSlot = parent.locator(
    ':scope > .rivto-block-row > .rivto-block-slot[data-slot-owner="block"][data-slot-position="left-top"]',
  );
  const content = parent.locator(":scope > .rivto-block-row [data-block-content]");
  const childText = parent.locator(":scope > .rivto-block-children [data-block-content]").first();
  const childValue = await childText.textContent();

  await expect(leftTopSlot.locator(":scope > *")).toHaveCount(2);
  await expect(leftTopSlot.locator(":scope > *").nth(0)).toHaveClass(/block-handle/);
  await expect(leftTopSlot.locator(":scope > *").nth(1)).toHaveAttribute(
    "data-collapse-toggle",
    "true",
  );
  const [dragBox, toggleBox, contentBox] = await Promise.all([
    leftTopSlot.locator(".block-handle").boundingBox(),
    toggle.boundingBox(),
    content.boundingBox(),
  ]);
  if (!dragBox || !toggleBox || !contentBox) {
    throw new Error("Expected block control geometry");
  }
  expect(toggleBox.x).toBeLessThan(dragBox.x);
  expect(dragBox.x - toggleBox.x - toggleBox.width).toBeGreaterThanOrEqual(0);
  expect(dragBox.x + dragBox.width).toBeLessThanOrEqual(contentBox.x);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(parent.locator(":scope > .rivto-block-children")).toBeHidden();
  await expect(parent.getByText(childValue ?? "", { exact: true })).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    parent.locator(":scope > .rivto-block-children [data-block-content]").first(),
  ).toHaveText(childValue ?? "");
});

test("supports collapse keys for editing and multi-block selection", async ({ page }) => {
  const first = await collapsibleRoot(page, 0);
  const second = await collapsibleRoot(page, 1);
  const firstToggle = first.locator(":scope > .rivto-block-row [data-collapse-toggle]");
  const secondToggle = second.locator(":scope > .rivto-block-row [data-collapse-toggle]");

  await first.locator(":scope > .rivto-block-row [data-block-content]").click();
  await page.keyboard.press("Control+ArrowUp");
  await expect(firstToggle).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Control+ArrowDown");
  await expect(firstToggle).toHaveAttribute("aria-expanded", "true");

  await first
    .locator(":scope > .rivto-block-row [data-block-content]")
    .click({ modifiers: ["Control"] });
  await second
    .locator(":scope > .rivto-block-row [data-block-content]")
    .click({ modifiers: ["Control"] });
  await page.keyboard.press("Control+;");
  await expect(firstToggle).toHaveAttribute("aria-expanded", "false");
  await expect(secondToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(`${HOST_BLOCK_ID_SELECTOR}[data-block-selected]`)).toHaveCount(2);
});

test("moves a hidden caret selection to its collapsed parent", async ({ page }) => {
  const parent = await collapsibleRoot(page);
  const child = parent.locator(":scope > .rivto-block-children [data-block-content]").first();
  await child.click();

  await parent.locator(":scope > .rivto-block-row [data-collapse-toggle]").click();

  await expect(parent).toHaveAttribute("data-block-selected", "true");
  await expect(page.locator(`${HOST_BLOCK_ID_SELECTOR}[data-block-selected]`)).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => getSelection()?.rangeCount ?? 0)).toBe(0);
});

test("treats a collapsed parent as a visible leaf for Enter and Delete", async ({ page }) => {
  const parent = await collapsibleRoot(page);
  const content = parent.locator(":scope > .rivto-block-row [data-block-content]");
  await parent.locator(":scope > .rivto-block-row [data-collapse-toggle]").click();

  const roots = page.locator(`[data-journal-document="today"] ${ROOT_BLOCK_SELECTOR}`);
  const ids = await roots.evaluateAll((blocks) =>
    blocks.map((block) => block.getAttribute("data-block-id")),
  );
  const parentIndex = ids.indexOf(await parent.getAttribute(BLOCK_ID_ATTRIBUTE));
  const next = roots.nth(parentIndex + 1);
  const nextId = await next.getAttribute(BLOCK_ID_ATTRIBUTE);
  const nextText = await next
    .locator(":scope > .rivto-block-row [data-block-content]")
    .textContent();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Delete");
  await expect(parent).toBeVisible();
  await expect(next.locator(":scope > .rivto-block-row [data-block-content]")).toHaveText(
    nextText ?? "",
  );

  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  const inserted = roots.nth(parentIndex + 1);
  await expect(inserted).toBeVisible();
  expect(await inserted.getAttribute(BLOCK_ID_ATTRIBUTE)).not.toBe(nextId);
  await expect(parent.locator(":scope > .rivto-block-children")).toBeHidden();
});

test("copies a collapsed parent with its hidden descendants", async ({ page }) => {
  const parent = await collapsibleRoot(page);
  const childCount = await parent
    .locator(`:scope > .rivto-block-children ${BLOCK_ID_SELECTOR}`)
    .count();
  await parent
    .locator(":scope > .rivto-block-row [data-block-content]")
    .click({ modifiers: ["Control"] });
  await parent.locator(":scope > .rivto-block-row [data-collapse-toggle]").click();
  await page.evaluate(() => {
    document.addEventListener(
      "copy",
      (event) => {
        (window as typeof window & { collapsedCopy?: string }).collapsedCopy =
          event.clipboardData?.getData("application/x-rivto+json") ?? "";
      },
      { once: true },
    );
  });

  await page.keyboard.press("Control+c");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = (window as typeof window & { collapsedCopy?: string }).collapsedCopy;
        if (!value) {
          return 0;
        }
        const bundle = JSON.parse(value) as { blocks: ClipboardBlock[] };
        const descendants = (block: ClipboardBlock): number =>
          block.children.reduce((total, child) => total + 1 + descendants(child), 0);
        return bundle.blocks[0] ? descendants(bundle.blocks[0]) : 0;
      }),
    )
    .toBe(childCount);
});

test("drops inside a collapsed parent and keeps the moved subtree hidden", async ({ page }) => {
  const source = page.locator(`.page-surface ${ROOT_BLOCK_SELECTOR}`).first();
  const sourceText = await source
    .locator(":scope > .rivto-block-row [data-block-content]")
    .textContent();
  const target = await collapsibleRoot(page);
  const toggle = target.locator(":scope > .rivto-block-row [data-collapse-toggle]");
  await toggle.click();
  await target.scrollIntoViewIfNeeded();

  await source.locator(":scope > .rivto-block-row").hover();
  const handleBox = await source.locator(":scope > .rivto-block-row .block-handle").boundingBox();
  const targetBox = await target.locator(":scope > .rivto-block-row").boundingBox();
  if (!handleBox || !targetBox) {
    throw new Error("Expected drag geometry");
  }
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();

  await expect(page.getByText(sourceText ?? "", { exact: true })).toHaveCount(0);
  await expect(target).toHaveAttribute("data-block-selected", "true");
  await page.keyboard.press("Control+ArrowDown");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    target
      .locator(":scope > .rivto-block-children [data-block-content]")
      .filter({ hasText: sourceText ?? "" })
      .first(),
  ).toBeVisible();
});
