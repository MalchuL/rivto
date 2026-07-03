import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset document" }).click();
});

test("edits blocks, opens slash commands, and persists content", async ({ page }) => {
  const paragraph = page.getByRole("textbox", { name: "Paragraph" }).first();
  await paragraph.fill("Persistent paragraph");
  await expect(paragraph).toHaveText("Persistent paragraph");

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText("Persistent paragraph");

  await paragraph.fill("/");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Heading 2" }).click();
  await expect(page.locator('[data-type="heading2"]')).toBeVisible();
});

test("switches the same document between page and edgeless views", async ({ page }) => {
  const text = "One document, two views";
  await page.getByRole("textbox", { name: "Paragraph" }).first().fill(text);
  await page.getByRole("button", { name: "Edgeless" }).click();
  await expect(page.locator(".rv-canvas")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText(text);
  await expect(page.locator(".demo-callout")).toBeVisible();

  await page.getByRole("button", { name: "Page" }).click();
  await expect(page.locator(".rv-page")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText(text);
  await expect(page.locator(".demo-callout")).toBeVisible();
});

test("creates generic UI blocks with the configured default type", async ({ page }) => {
  const paragraphs = page.getByRole("textbox", { name: "Paragraph" });
  const before = await paragraphs.count();
  await page.getByRole("button", { name: "Add block" }).click();
  await expect(paragraphs).toHaveCount(before + 1);
});

test("copies a native selection spanning multiple blocks", async ({ page }) => {
  const paragraphs = page.getByRole("textbox", { name: "Paragraph" });
  await paragraphs.nth(0).fill("First block");
  await paragraphs.nth(1).fill("Second block");

  const firstBox = await paragraphs.nth(0).boundingBox();
  const secondBox = await paragraphs.nth(1).boundingBox();
  if (!firstBox || !secondBox) throw new Error("Expected two visible editable blocks");
  await page.mouse.move(firstBox.x + 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width - 2, secondBox.y + secondBox.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const head = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement;
    return anchor?.closest("[data-rivto-block]") !== head?.closest("[data-rivto-block]");
  })).toBe(true);

  await expect.poll(() => page.evaluate(() => {
    const highlight = "highlights" in CSS ? CSS.highlights.get("rivto-cross-selection") : undefined;
    if (highlight) return [...highlight].map((range) => range instanceof Range ? range.toString() : "").join("\n");
    return [...document.querySelectorAll<HTMLElement>("[data-rivto-cross-selected]")].map((element) => element.innerText).join("\n");
  })).toContain("Second block");

  await expect(page.getByLabel("Block controls").first()).toHaveCSS("user-select", "none");

  const copied = await page.evaluate(() => {
    const selection = window.getSelection();
    const head = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement;
    if (!head) throw new Error("Expected a native browser selection");
    const clipboardData = new DataTransfer();
    const copyEvent = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData });
    head.dispatchEvent(copyEvent);
    return {
      prevented: copyEvent.defaultPrevented,
      anchor: (selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement)
        ?.closest<HTMLElement>("[data-rivto-block]")?.dataset.rivtoBlock,
      head: (selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement)
        ?.closest<HTMLElement>("[data-rivto-block]")?.dataset.rivtoBlock,
      text: clipboardData.getData("text/plain"),
    };
  });

  expect(copied.prevented).toBe(true);
  expect(copied.anchor).toEqual(expect.any(String));
  expect(copied.head).toEqual(expect.any(String));
  expect(copied.anchor).not.toBe(copied.head);
  expect(copied.text).not.toMatch(/[⋮＋→←×]/u);
});

test("paints bottom-to-top cross-block selection before mouseup", async ({ page }) => {
  const paragraphs = page.getByRole("textbox", { name: "Paragraph" });
  await paragraphs.nth(0).fill("First block");
  await paragraphs.nth(1).fill("Second block");

  const firstBox = await paragraphs.nth(0).boundingBox();
  const secondBox = await paragraphs.nth(1).boundingBox();
  if (!firstBox || !secondBox) throw new Error("Expected two visible editable blocks");
  await page.mouse.move(secondBox.x + secondBox.width - 2, secondBox.y + secondBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + 2, firstBox.y + firstBox.height / 2, { steps: 12 });

  // This assertion intentionally runs while the mouse button is still down.
  // It catches the former reverse-drag bug where highlighting appeared only
  // after mouseup dispatched the browser's delayed selectionchange event.
  await expect.poll(() => page.evaluate(() => {
    const highlight = "highlights" in CSS ? CSS.highlights.get("rivto-cross-selection") : undefined;
    if (highlight) return [...highlight].map((range) => range instanceof Range ? range.toString() : "").join("\n");
    return [...document.querySelectorAll<HTMLElement>("[data-rivto-cross-selected]")].map((element) => element.innerText).join("\n");
  })).toContain("First block");

  await page.mouse.up();
});

test("pastes multiline text at the caret and refreshes focused content", async ({ page }) => {
  const paragraph = page.getByRole("textbox", { name: "Paragraph" }).first();
  await paragraph.fill("Hello world");
  await paragraph.focus();
  await paragraph.evaluate((content) => {
    const node = content.firstChild;
    if (!node) throw new Error("Expected editable text");
    const selection = window.getSelection();
    selection?.removeAllRanges();
    const range = document.createRange();
    range.setStart(node, 6);
    range.collapse(true);
    selection?.addRange(range);
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "one\ntwo");
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", { value: clipboardData });
    content.dispatchEvent(pasteEvent);
  });

  await expect(paragraph).toHaveText("Hello one\ntwoworld");
  await expect(page.locator(".snapshot pre")).toContainText("Hello one\\ntwoworld");
});

test("stores Markdown source and renders its heading and inline syntax", async ({ page }) => {
  const paragraph = page.getByRole("textbox", { name: "Paragraph" }).first();
  await paragraph.fill("# A **Markdown** heading");
  await page.getByRole("button", { name: "Page" }).click();

  const heading = page.locator('[data-type="heading"]').first();
  await expect(heading).toContainText("A Markdown heading");
  await expect(heading.locator("strong")).toHaveText("Markdown");
});
