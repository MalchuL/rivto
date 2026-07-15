import { expect, test, type Locator } from "@playwright/test";

async function textPoint(content: Locator, offset: number): Promise<{ x: number; y: number }> {
  return content.evaluate((element, targetOffset) => {
    const node = element.firstChild;
    if (!node) throw new Error("Expected editable text");
    const length = node.textContent?.length ?? 0;
    if (targetOffset < 0 || targetOffset > length) throw new Error("Text offset outside content");
    const range = document.createRange();
    const fromPreviousCharacter = targetOffset === length && length > 0;
    range.setStart(node, fromPreviousCharacter ? targetOffset - 1 : targetOffset);
    range.setEnd(node, fromPreviousCharacter ? targetOffset : Math.min(length, targetOffset + 1));
    const rect = range.getBoundingClientRect();
    return {
      x: fromPreviousCharacter ? rect.right - 1 : rect.left + 1,
      y: rect.top + rect.height / 2,
    };
  }, offset);
}

async function copiedText(content: Locator): Promise<string> {
  return content.evaluate((element) => {
    const clipboardData = new DataTransfer();
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    element.dispatchEvent(event);
    return clipboardData.getData("text/plain");
  });
}

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

  await page.getByRole("button", { name: "Add block", exact: true }).click();
  const slashBlock = page.locator(".rv-block-content:focus");
  await expect(slashBlock).toBeVisible();
  await slashBlock.press("/");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Heading 2" }).click();
  await expect(page.locator('[data-type="heading2"]')).toBeVisible();
});

test("switches the same document between block and edgeless views", async ({ page }) => {
  const text = "One document, two views";
  await page.getByRole("textbox", { name: "Paragraph" }).first().fill(text);
  await page.getByRole("button", { name: "Edgeless" }).click();
  await expect(page.locator(".rv-canvas")).toBeVisible();
  const canvasParagraph = page.getByRole("textbox", { name: "Paragraph" }).first();
  await expect(canvasParagraph).toHaveText(text);
  await canvasParagraph.click();
  await canvasParagraph.press("End");
  await page.keyboard.type(" edited");
  await expect(canvasParagraph).toHaveText(`${text} edited`);
  await expect(page.locator(".demo-callout")).toBeVisible();

  await page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(page.locator(".rv-page")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText(`${text} edited`);
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

test("preserves exact partial endpoints in both cross-block directions", async ({ page }) => {
  const paragraphs = page.getByRole("textbox", { name: "Paragraph" });
  const first = paragraphs.nth(0);
  const second = paragraphs.nth(1);
  await first.fill("ABCDE");
  await second.fill("FGHIJ");

  const firstTwo = await textPoint(first, 2);
  const secondThree = await textPoint(second, 3);
  await page.mouse.move(firstTwo.x, firstTwo.y);
  await page.mouse.down();
  await page.mouse.move(secondThree.x, secondThree.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => copiedText(second)).toBe("CDE\nFGH");

  const secondFour = await textPoint(second, 4);
  const firstOne = await textPoint(first, 1);
  await page.mouse.move(secondFour.x, secondFour.y);
  await page.mouse.down();
  await page.mouse.move(firstOne.x, firstOne.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => copiedText(first)).toBe("BCDE\nFGHI");
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    const blockId = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)
      ?.closest<HTMLElement>("[data-rivto-block]")?.dataset.rivtoBlock;
    return { anchor: blockId(selection?.anchorNode ?? null), head: blockId(selection?.focusNode ?? null) };
  })).toEqual({
    anchor: await second.evaluate((element) => element.closest<HTMLElement>("[data-rivto-block]")?.dataset.rivtoBlock),
    head: await first.evaluate((element) => element.closest<HTMLElement>("[data-rivto-block]")?.dataset.rivtoBlock),
  });
});

test("replaces a partial cross-block selection as one document operation", async ({ page }) => {
  const paragraphs = page.getByRole("textbox", { name: "Paragraph" });
  const first = paragraphs.nth(0);
  const second = paragraphs.nth(1);
  await first.fill("ABCDE");
  await second.fill("FGHIJ");
  const secondBlockId = await second.evaluate((element) => element.closest<HTMLElement>("[data-rivto-block]")?.dataset.rivtoBlock);
  if (!secondBlockId) throw new Error("Expected second block ID");
  const start = await textPoint(first, 2);
  const end = await textPoint(second, 3);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.type("X");
  await expect(first).toHaveText("ABXIJ");
  await expect(page.locator(`[data-rivto-block="${secondBlockId}"]`)).toHaveCount(0);
});

test("selects ordered block ranges from handles and keyboard in either direction", async ({ page }) => {
  const blocks = page.locator(".rv-page > .rv-block");
  await blocks.nth(2).hover();
  await blocks.nth(2).getByRole("button", { name: "Drag block" }).click();
  await blocks.nth(0).hover();
  await blocks.nth(0).getByRole("button", { name: "Drag block" }).click({ modifiers: ["Shift"] });
  await expect(blocks.nth(0)).toHaveAttribute("data-selected", "true");
  await expect(blocks.nth(1)).toHaveAttribute("data-selected", "true");
  await expect(blocks.nth(2)).toHaveAttribute("data-selected", "true");

  await blocks.nth(0).hover();
  const firstHandle = blocks.nth(0).getByRole("button", { name: "Drag block" });
  await firstHandle.click();
  await firstHandle.press("Shift+ArrowDown");
  await expect(blocks.nth(0)).toHaveAttribute("data-selected", "true");
  await expect(blocks.nth(1)).toHaveAttribute("data-selected", "true");
  await expect(blocks.nth(2)).not.toHaveAttribute("data-selected", "true");
});

test("selects whole blocks by dragging across blank page space", async ({ page }) => {
  const editorPage = page.locator(".rv-page");
  const blocks = page.locator(".rv-page > .rv-block");
  const pageBox = await editorPage.boundingBox();
  const secondBox = await blocks.nth(1).boundingBox();
  if (!pageBox || !secondBox) throw new Error("Expected page and blocks");
  const x = secondBox.x + secondBox.width / 2;
  await page.mouse.move(x, pageBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(x + 4, secondBox.y + secondBox.height - 2, { steps: 8 });
  await expect(page.locator(".rv-selection-rect")).toBeVisible();
  await page.mouse.up();
  await expect(blocks.nth(0)).toHaveAttribute("data-selected", "true");
  await expect(blocks.nth(1)).toHaveAttribute("data-selected", "true");
});

test("moves a collapsed caret between blocks with the same text offset", async ({ page }) => {
  const paragraphs = page.getByRole("textbox", { name: "Paragraph" });
  await paragraphs.nth(0).fill("abcdef");
  await paragraphs.nth(1).fill("uvwxyz");
  const point = await textPoint(paragraphs.nth(0), 2);
  await page.mouse.click(point.x, point.y);

  await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    const content = document.activeElement?.closest(".rv-block-content");
    return { text: content?.textContent, offset: selection?.focusOffset };
  })).toEqual({ text: "uvwxyz", offset: 2 });
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
  await page.getByRole("button", { name: "Block", exact: true }).click();

  const heading = page.locator('[data-type="heading"]').first();
  await expect(heading).toContainText("A Markdown heading");
  await expect(heading.locator("strong")).toHaveText("Markdown");
});

test("shows command, event, and selection runtime state", async ({ page }) => {
  const inspector = page.getByLabel("Runtime inspector");
  const paragraph = page.getByRole("textbox", { name: "Paragraph" }).first();
  await paragraph.fill("Runtime state");
  await paragraph.press("ArrowLeft");
  await expect(inspector).toContainText("Mode: block");
  await expect(inspector).toContainText("Selection: text");
  await expect(inspector).toContainText("Event: keydown");
  await expect(inspector).toContainText("Command: selection.set");

  await page.getByRole("button", { name: "Plugin command" }).click();
  await expect(inspector).toContainText("Command: demo.addCallout");
  await expect(page.locator(".demo-callout")).toHaveCount(2);

  await page.getByRole("button", { name: "Select blocks" }).click();
  await expect(inspector).toContainText("Selection: block");
});

test("selects and moves an object in edgeless mode through runtime commands", async ({ page }) => {
  await page.getByRole("button", { name: "Edgeless" }).click();
  const block = page.locator(".rv-canvas-block").first();
  await block.locator(".rv-block-handle").click();
  await expect(page.getByLabel("Runtime inspector")).toContainText("Selection: edgeless");
  const before = await block.evaluate((element) => getComputedStyle(element).left);
  await block.focus();
  await block.press("ArrowRight");
  await expect.poll(() => block.evaluate((element) => getComputedStyle(element).left)).not.toBe(before);
  await expect(page.getByLabel("Runtime inspector")).toContainText("Command: block.layout.set");

  const firstBox = await page.locator(".rv-canvas-block").nth(0).boundingBox();
  const secondBox = await page.locator(".rv-canvas-block").nth(1).boundingBox();
  if (!firstBox || !secondBox) throw new Error("Expected edgeless blocks");
  await page.mouse.move(firstBox.x + 8, firstBox.y - 12);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width - 8, secondBox.y + secondBox.height + 12, { steps: 8 });
  await expect(page.locator(".rv-selection-rect")).toBeVisible();
  await page.mouse.up();
  const selected = page.locator(".rv-canvas-block[data-selected=true]");
  await expect(selected).toHaveCount(2);
  const firstBefore = await selected.nth(0).evaluate((element) => getComputedStyle(element).left);
  const secondBefore = await selected.nth(1).evaluate((element) => getComputedStyle(element).left);
  await selected.nth(0).focus();
  await selected.nth(0).press("ArrowRight");
  await expect.poll(() => selected.nth(0).evaluate((element) => getComputedStyle(element).left)).not.toBe(firstBefore);
  await expect.poll(() => selected.nth(1).evaluate((element) => getComputedStyle(element).left)).not.toBe(secondBefore);
});

test("keeps edgeless text editing separate from object selection", async ({ page }) => {
  await page.getByRole("button", { name: "Edgeless" }).click();
  const inspector = page.getByLabel("Runtime inspector");
  const block = page.locator(".rv-canvas-block").first();
  const content = block.getByRole("textbox").first();

  await block.locator(".rv-block-handle").click();
  await expect(inspector).toContainText("Selection: edgeless");

  await content.click();
  await content.press("End");
  await page.keyboard.type(" editable");
  await expect(content).toContainText("editable");
  await expect(inspector).toContainText("Selection: text");

  await block.locator(".rv-block-handle").click();
  await expect(inspector).toContainText("Selection: edgeless");
});

test("keeps edgeless form controls focused without selecting their card", async ({ page }) => {
  await page.getByRole("button", { name: "Add block", exact: true }).click();
  const empty = page.locator(".rv-block-content:focus");
  await empty.press("/");
  await page.getByRole("menuitem", { name: "Image" }).click();
  await page.getByRole("button", { name: "Edgeless" }).click();

  const input = page.getByRole("textbox", { name: "image URL" });
  await input.fill("https://example.test/image.png");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("https://example.test/image.png");
  await expect(page.getByLabel("Runtime inspector")).not.toContainText("Selection: edgeless");

  await page.locator('.rv-canvas-block[data-type="image"] .rv-block-handle').click();
  await expect(page.getByLabel("Runtime inspector")).toContainText("Selection: edgeless");
});
