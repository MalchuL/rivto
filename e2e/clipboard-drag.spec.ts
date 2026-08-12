import { expect, test } from "@playwright/test";
import { BLOCK_ID_SELECTOR, blockTypeSelector } from "./dom-markers";

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

async function caretOffset(content: import("@playwright/test").Locator): Promise<number> {
  return content.evaluate((element) => {
    const selection = element.ownerDocument.getSelection();
    if (!selection?.focusNode || !element.contains(selection.focusNode)) return -1;
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.setEnd(selection.focusNode, selection.focusOffset);
    return range.toString().length;
  });
}

const structuredBundle = JSON.stringify({
  version: 4,
  startsWithText: true,
  blocks: [{
    id: "copied",
    type: "paragraph",
    listProps: { collapsed: false, type: "list", checked: false },
    content: "Copied",
    props: {},
    pluginData: {},
    children: [],
  }],
  links: [],
});

async function paste(page: import("@playwright/test").Page, asPlainText: boolean): Promise<void> {
  const content = page.locator("[data-block-content]").first();
  await content.click();
  await page.keyboard.press("End");
  await content.evaluate((element, { structured, plainText, forcePlainText }) => {
    if (forcePlainText) element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "v", ctrlKey: true, shiftKey: true, bubbles: true,
    }));
    const data = new DataTransfer();
    data.setData("application/x-rivto+json", structured);
    data.setData("text/plain", plainText);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    element.dispatchEvent(event);
  }, {
    structured: structuredBundle,
    plainText: "Copied\n    second line",
    forcePlainText: asPlainText,
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("normal structured text paste merges into the target", async ({ page }) => {
  const content = page.locator("[data-block-content]").first();
  const original = await page.locator("[data-block-content]").first().textContent();
  await paste(page, false);
  await expect(content).toHaveText(`${original}Copied`);
  await expect.poll(() => caretOffset(content)).toBe(`${original}Copied`.length);
});

test("Ctrl+Shift+V pastes multiline plain text inside one block", async ({ page }) => {
  const rootsBefore = await page.locator(`${BLOCK_ID_SELECTOR}.page-block`).count();
  const original = await page.locator("[data-block-content]").first().textContent();
  await paste(page, true);
  await expect.poll(() => page.locator("[data-block-content]").first().textContent()).toBe(
    `${original}Copied\n    second line`,
  );
  await expect.poll(() => caretOffset(page.locator("[data-block-content]").first())).toBe(
    `${original}Copied\n    second line`.length,
  );
  await expect(page.locator(`${BLOCK_ID_SELECTOR}.page-block`)).toHaveCount(rootsBefore);
});

test("copies a mouse text selection and pastes it inline", async ({ page }) => {
  const source = page.locator("[data-block-content]").first();
  const target = page.locator("[data-block-content]").nth(1);
  const copiedText = await source.textContent();
  const targetText = await target.textContent();
  await source.selectText();
  await page.evaluate(() => {
    document.addEventListener("copy", (event) => {
      (window as typeof window & { mouseCopy?: { text: string; markdown: string; structured: string } }).mouseCopy = {
        text: event.clipboardData?.getData("text/plain") ?? "",
        markdown: event.clipboardData?.getData("text/markdown") ?? "",
        structured: event.clipboardData?.getData("application/x-rivto+json") ?? "",
      };
    }, { once: true });
  });

  await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { mouseCopy?: { text: string } }
  ).mouseCopy?.text)).toBe(copiedText);
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { mouseCopy?: { markdown: string } }
  ).mouseCopy?.markdown)).toBe(copiedText);

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

test("copies Counter display text to every portable clipboard flavor", async ({ page }) => {
  const counter = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.counter")}`);
  const button = counter.locator(".custom-counter-block");
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error("Expected Counter geometry");
  await page.mouse.move(box.x + box.width / 2 - 6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(counter).toHaveAttribute("data-block-selected", "true");

  await page.evaluate(() => {
    document.addEventListener("copy", (event) => {
      (window as typeof window & { counterCopy?: Record<string, string> }).counterCopy = {
        html: event.clipboardData?.getData("text/html") ?? "",
        markdown: event.clipboardData?.getData("text/markdown") ?? "",
        structured: event.clipboardData?.getData("application/x-rivto+json") ?? "",
        text: event.clipboardData?.getData("text/plain") ?? "",
      };
    }, { once: true });
  });
  await page.keyboard.press("Control+c");

  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { counterCopy?: Record<string, string> }
  ).counterCopy)).not.toBeUndefined();
  const flavors = await page.evaluate(() => (
    window as typeof window & { counterCopy: Record<string, string> }
  ).counterCopy);
  expect(flavors.text).toBe("Count: 2");
  expect(flavors.html).toBe("<p>Count: 2</p>");
  expect(flavors.markdown).toBe("Count: 2");
  expect(JSON.parse(flavors.structured).blocks[0]).toMatchObject({
    content: "",
    props: { count: 2 },
  });
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
  const before = await page.locator(BLOCK_ID_SELECTOR).count();
  const start = await textPoint(contents.nth(0), 2);
  const end = await textPoint(contents.nth(2), 8);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator("[data-block-selected]")).toHaveCount(3);

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");

  await expect(page.locator(BLOCK_ID_SELECTOR)).toHaveCount(before + 3);
});

test("drags selected sibling roots together", async ({ page }) => {
  const blocks = page.locator(BLOCK_ID_SELECTOR);
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
  await expect(page.locator("[data-block-selected]")).toHaveCount(2);
});
