import { expect, test, type Locator } from "@playwright/test";

async function textPoint(content: Locator, offset: number): Promise<{ x: number; y: number }> {
  return content.evaluate((element, targetOffset) => {
    const node = element.firstChild;
    if (!node) throw new Error("Expected editable text");
    const length = node.textContent?.length ?? 0;
    const safeOffset = Math.max(0, Math.min(targetOffset, length));
    const range = document.createRange();
    const fromPreviousCharacter = safeOffset === length && length > 0;
    range.setStart(node, fromPreviousCharacter ? safeOffset - 1 : safeOffset);
    range.setEnd(node, fromPreviousCharacter ? safeOffset : Math.min(length, safeOffset + 1));
    const rect = range.getBoundingClientRect();
    return {
      x: fromPreviousCharacter ? rect.right - 1 : rect.left + 1,
      y: rect.top + rect.height / 2,
    };
  }, offset);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset document" }).click();
});

test("keeps editable click as text selection instead of block selection", async ({ page }) => {
  const content = page.locator("[data-rivto-block-content]").first();
  await content.click();
  await content.press("End");
  await page.keyboard.type(" edited");

  await expect(content).toContainText("edited");
  await expect(content.locator("xpath=ancestor::*[@data-rivto-block-id][1]")).not.toHaveAttribute("data-rivto-selected", "true");
});

test("keeps partial same-block native selection stable", async ({ page }) => {
  const content = page.locator("[data-rivto-block-content]").first();
  await content.evaluate((element) => { element.textContent = "ABCDE"; });
  await content.dispatchEvent("input");

  const start = await textPoint(content, 1);
  const end = await textPoint(content, 4);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("BCD");
});

test("represents cross-block native selection", async ({ page }) => {
  const contents = page.locator("[data-rivto-block-content]");
  const first = contents.nth(0);
  const second = contents.nth(1);
  await first.evaluate((element) => { element.textContent = "ABCDE"; });
  await first.dispatchEvent("input");
  await second.evaluate((element) => { element.textContent = "FGHIJ"; });
  await second.dispatchEvent("input");

  const start = await textPoint(first, 2);
  const end = await textPoint(second, 3);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    const blockId = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)
      ?.closest<HTMLElement>("[data-rivto-block-id]")
      ?.getAttribute("data-rivto-block-id");
    const highlight = "highlights" in CSS ? CSS.highlights.get("rivto-cross-selection") : undefined;
    const highlightText = highlight
      ? [...highlight].map((range) => range instanceof Range ? range.toString() : "").join("\n")
      : [...document.querySelectorAll<HTMLElement>("[data-rivto-cross-selected]")].map((element) => element.innerText).join("\n");
    return {
      text: selection?.toString(),
      anchor: blockId(selection?.anchorNode ?? null),
      head: blockId(selection?.focusNode ?? null),
      highlightText,
    };
  })).toMatchObject({
    anchor: expect.any(String),
    head: expect.any(String),
    highlightText: expect.stringContaining("FGH"),
  });
});
