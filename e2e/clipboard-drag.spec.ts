import { expect, test } from "@playwright/test";

async function textPoint(
  content: import("@playwright/test").Locator,
  offset: number,
): Promise<{ x: number; y: number }> {
  return content.evaluate((element, requestedOffset) => {
    const node = element.firstChild;
    if (!node) throw new Error("Expected editable text");
    const length = node.textContent?.length ?? 0;
    const safeOffset = Math.max(0, Math.min(requestedOffset, length));
    const range = document.createRange();
    range.setStart(node, safeOffset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + rect.height / 2 };
  }, offset);
}

const structuredBundle = JSON.stringify({
  version: 1,
  startsWithText: true,
  blocks: [{
    id: "copied",
    type: "paragraph",
    content: "Copied",
    props: {},
    pluginData: {},
    children: [],
  }],
  links: [],
});

async function paste(page: import("@playwright/test").Page, asBlocks: boolean): Promise<void> {
  const content = page.locator("[data-block-content]").first();
  await content.click();
  await page.keyboard.press("End");
  await content.evaluate((element, { structured, forceBlocks }) => {
    if (forceBlocks) element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "v", ctrlKey: true, shiftKey: true, bubbles: true,
    }));
    const data = new DataTransfer();
    data.setData("application/x-rivto+json", structured);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    element.dispatchEvent(event);
  }, { structured: structuredBundle, forceBlocks: asBlocks });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("normal structured text paste merges into the target", async ({ page }) => {
  const original = await page.locator("[data-block-content]").first().textContent();
  await paste(page, false);
  await expect(page.locator("[data-block-content]").first()).toHaveText(`${original}Copied`);
});

test("Ctrl+Shift+V keeps structured text as a block", async ({ page }) => {
  const original = await page.locator("[data-block-content]").first().textContent();
  await paste(page, true);
  await expect(page.locator("[data-block-content]").first()).toHaveText(original ?? "");
  await expect(page.locator("[data-block-content]").nth(1)).toHaveText("Copied");
});

test("copies a mouse text selection and pastes it inline", async ({ page }) => {
  const source = page.locator("[data-block-content]").first();
  const target = page.locator("[data-block-content]").nth(1);
  const copiedText = await source.textContent();
  const targetText = await target.textContent();
  await source.selectText();
  await page.evaluate(() => {
    document.addEventListener("copy", (event) => {
      (window as typeof window & { mouseCopy?: { text: string; structured: string } }).mouseCopy = {
        text: event.clipboardData?.getData("text/plain") ?? "",
        structured: event.clipboardData?.getData("application/x-rivto+json") ?? "",
      };
    }, { once: true });
  });

  await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { mouseCopy?: { text: string } }
  ).mouseCopy?.text)).toBe(copiedText);

  await target.click();
  await page.keyboard.press("End");
  await target.evaluate((element) => {
    const structured = (window as typeof window & {
      mouseCopy?: { structured: string };
    }).mouseCopy?.structured ?? "";
    const data = new DataTransfer();
    data.setData("application/x-rivto+json", structured);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    element.dispatchEvent(event);
  });

  await expect(target).toHaveText(`${targetText}${copiedText}`);
});

test("copies a multi-block selection from the focused page", async ({ page }) => {
  const contents = page.locator("[data-block-content]");
  const first = await contents.nth(0).textContent();
  const second = await contents.nth(1).textContent();
  await contents.nth(0).click({ modifiers: ["Control"] });
  await contents.nth(1).click({ modifiers: ["Control"] });
  await page.evaluate(() => {
    document.addEventListener("copy", (event) => {
      (window as typeof window & { copyResult?: unknown }).copyResult = {
        text: event.clipboardData?.getData("text/plain"),
        prevented: event.defaultPrevented,
      };
    }, { once: true });
  });

  await page.keyboard.press("Control+c");

  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { copyResult?: unknown }
  ).copyResult)).toEqual({
    text: `${first}\n${second}`,
    prevented: true,
  });
});

test("copies and pastes a mouse-dragged multi-block selection", async ({ page }) => {
  const contents = page.locator("[data-block-content]");
  const before = await page.locator("[data-block-id]").count();
  const start = await textPoint(contents.nth(0), 2);
  const end = await textPoint(contents.nth(2), 8);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator("[data-selected]")).toHaveCount(3);

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");

  await expect(page.locator("[data-block-id]")).toHaveCount(before + 3);
});

test("drags selected sibling roots together", async ({ page }) => {
  const blocks = page.locator("[data-block-id]");
  const firstText = await blocks.nth(0).locator("[data-block-content]").textContent();
  const secondText = await blocks.nth(1).locator("[data-block-content]").textContent();
  await blocks.nth(0).locator("[data-block-content]").click({ modifiers: ["Control"] });
  await blocks.nth(1).locator("[data-block-content]").click({ modifiers: ["Control"] });

  const handle = blocks.nth(0).locator(".page-drag-handle");
  const target = blocks.nth(4);
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!handleBox || !targetBox) throw new Error("Expected drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await expect(page.locator(".page-drag-overlay")).toContainText(firstText ?? "");
  await expect(page.locator(".page-drag-overlay")).toContainText(secondText ?? "");
  await page.mouse.up();
  await expect(page.locator("[data-selected]")).toHaveCount(2);
});
