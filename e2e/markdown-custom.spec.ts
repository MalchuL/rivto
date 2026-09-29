import { expect, test } from "@playwright/test";
import {
  blockIdSelector,
  blockTypeSelector,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "./dom-markers";

const BLOCK_ANCESTOR_XPATH = `xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`;
const MARKDOWN_CODE_EDITOR_CLASS = "markdown-code-editor";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("renders HTML, CSS, and scripts in default blocks and nested content", async ({ page }) => {
  const rootHtml = [
    '<p class="rivto-html-sample" style="font-weight: 700">Native HTML</p>',
    '<table class="rivto-html-table"><tr><td>Cell</td><td>Two</td></tr></table>',
    "<style>.rivto-html-sample { color: rgb(10, 90, 40); } .rivto-html-table > tbody > tr > td { background-color: rgb(200, 230, 210); }</style>",
    '<script>document.querySelector(".rivto-html-sample")?.setAttribute("data-ran", "root")</script>',
  ].join("\n\n");
  const nestedHtml = [
    '<p class="rivto-html-nested">Nested HTML</p>',
    "<style>.rivto-html-nested { color: rgb(20, 40, 160); }</style>",
    '<script>document.querySelector(".rivto-html-nested")?.setAttribute("data-ran", "nested")</script>',
  ].join("\n\n");
  const cellHtml = [
    '<p class="rivto-html-cell">Inner cell</p>',
    "<style>.rivto-html-cell { color: rgb(120, 30, 30); }</style>",
    '<script>document.querySelector(".rivto-html-cell")?.setAttribute("data-ran", "cell")</script>',
  ].join("\n\n");
  const fencedHtml = [
    "```html",
    '<script>document.documentElement.dataset.rivtoFencedScript = "ran"</script>',
    "```",
  ].join("\n");

  const ids = await page.evaluate(({ root, nested, cell, fenced }) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    const blocks: { id: string; type: string; content: string; children?: typeof blocks }[] = [];
    const visit = (items: typeof blocks) => {
      for (const block of items) {
        blocks.push(block);
        if (block.children) visit(block.children);
      }
    };
    visit(editor.blocks.getBlocks() as typeof blocks);
    const rootBlock = blocks.find((block) => block.content === "**Rivto editor**");
    const nestedBlock = blocks.find((block) => block.content.startsWith("Level 2: this child"));
    const cellBlock = blocks.find((block) => block.type === "table-cell");
    const fencedBlock = blocks.find((block) => block.content.startsWith("Level 4:"));
    if (!rootBlock || !nestedBlock || !cellBlock || !fencedBlock) {
      throw new Error("Expected root, nested, cell, and fenced blocks");
    }
    editor.blocks.updateBlock(rootBlock.id, { content: root });
    editor.blocks.updateBlock(nestedBlock.id, { content: nested });
    editor.blocks.updateBlock(cellBlock.id, { content: cell });
    editor.blocks.updateBlock(fencedBlock.id, { content: fenced });
    return {
      rootId: rootBlock.id,
      nestedId: nestedBlock.id,
      cellId: cellBlock.id,
      fencedId: fencedBlock.id,
    };
  }, { root: rootHtml, nested: nestedHtml, cell: cellHtml, fenced: fencedHtml });

  const root = page.locator(blockIdSelector(ids.rootId));
  const nested = page.locator(blockIdSelector(ids.nestedId));
  const cell = page.locator(blockIdSelector(ids.cellId));
  const fenced = page.locator(blockIdSelector(ids.fencedId));

  await expect(root.locator(".markdown-preview .rivto-html-sample")).toHaveText("Native HTML");
  await expect(root.locator(".markdown-preview .rivto-html-table td").nth(1)).toHaveText("Two");
  await expect(root.locator(".markdown-preview .rivto-html-sample")).toHaveCSS("color", "rgb(10, 90, 40)");
  await expect(root.locator(".markdown-preview .rivto-html-sample")).toHaveCSS("font-weight", "700");
  await expect(root.locator(".markdown-preview .rivto-html-table td").first()).toHaveCSS("background-color", "rgb(200, 230, 210)");
  await expect(root.locator(".markdown-preview .rivto-html-sample")).toHaveAttribute("data-ran", "root");
  await expect(root.locator(".markdown-editor")).toContainText("<table");

  await expect(nested.locator(".markdown-preview .rivto-html-nested")).toHaveText("Nested HTML");
  await expect(nested.locator(".markdown-preview .rivto-html-nested")).toHaveCSS("color", "rgb(20, 40, 160)");
  await expect(nested.locator(".markdown-preview .rivto-html-nested")).toHaveAttribute("data-ran", "nested");

  await expect(cell.locator(".markdown-preview .rivto-html-cell")).toHaveText("Inner cell");
  await expect(cell.locator(".markdown-preview .rivto-html-cell")).toHaveCSS("color", "rgb(120, 30, 30)");
  await expect(cell.locator(".markdown-preview .rivto-html-cell")).toHaveAttribute("data-ran", "cell");

  await expect(fenced.locator(".markdown-preview .markdown-code-preview")).toContainText("<script>");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.rivtoFencedScript ?? ""))
    .toBe("");
});

test("renders JSX fences with Tailwind without resetting the page", async ({ page }) => {
  const today = page.locator('[data-journal-document="today"]');
  const headingSize = await today.locator(".journal-date").evaluate((element) => getComputedStyle(element).fontSize);
  const jsx = [
    "```jsx",
    '<div className="bg-[#123456] px-3 py-2 font-bold text-white">Live JSX</div>',
    "```",
  ].join("\n");
  const counter = [
    "```tsx",
    "function Counter() {",
    "  const [count, setCount] = useState(0);",
    "  return <button onClick={() => setCount(count + 1)}>Count {count}</button>;",
    "}",
    "render(<Counter />);",
    "```",
  ].join("\n");

  const ids = await page.evaluate(({ jsxSource, counterSource }) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    const blocks: { id: string; content: string; children?: typeof blocks }[] = [];
    const visit = (items: typeof blocks) => {
      for (const block of items) {
        blocks.push(block);
        if (block.children) visit(block.children);
      }
    };
    visit(editor.blocks.getBlocks() as typeof blocks);
    const rootBlock = blocks.find((block) => block.content === "**Rivto editor**");
    const nestedBlock = blocks.find((block) => block.content.startsWith("Level 2: this child"));
    if (!rootBlock || !nestedBlock) throw new Error("Expected root and nested blocks");
    editor.blocks.updateBlock(rootBlock.id, { content: jsxSource });
    editor.blocks.updateBlock(nestedBlock.id, { content: counterSource });
    return { rootId: rootBlock.id, nestedId: nestedBlock.id };
  }, { jsxSource: jsx, counterSource: counter });

  const root = page.locator(blockIdSelector(ids.rootId));
  const nested = page.locator(blockIdSelector(ids.nestedId));
  const live = root.locator(".markdown-live");
  await expect(live).toContainText("Live JSX");
  await expect(live.locator("div").last()).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await expect(live.locator("div").last()).toHaveCSS("font-weight", "700");
  await expect(today.locator(".journal-date")).toHaveCSS("font-size", headingSize);

  const button = nested.locator(".markdown-live button");
  await expect(button).toHaveText("Count 0");
  await button.click();
  await expect(button).toHaveText("Count 1");
});

test("shows full GFM at rest and raw source while editing", async ({ page }) => {
  const block = page.locator(blockTypeSelector("paragraph")).first();
  const editor = block.locator(":scope > .page-block-row .markdown-editor");
  const preview = block.locator(":scope > .page-block-row .markdown-preview");

  await expect(preview.locator("strong")).toHaveText("Rivto editor");
  await expect(editor).toHaveText("**Rivto editor**");
  await editor.click();
  await expect(editor).toBeFocused();
  await expect(preview).toHaveCount(0);

  const source = [
    "# Heading",
    "",
    "- [x] task",
    "",
    "| A | B |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "~~done~~",
    "",
    "```bash",
    'echo "hello"',
    "```",
    "",
    "```src/example.js",
    "const value = 42;",
    "```",
  ].join("\n");
  await editor.evaluate((element, value) => {
    element.textContent = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }, source);
  await editor.evaluate((element) => (element as HTMLElement).blur());

  await expect(editor).not.toBeFocused();
  await expect(preview.locator("h1")).toHaveText("Heading");
  await expect(preview.locator('input[type="checkbox"]')).toBeChecked();
  await expect(preview.locator("table")).toBeVisible();
  await expect(preview.locator("del")).toHaveText("done");
  await expect(preview.locator(".markdown-code-label").nth(0)).toHaveText("bash");
  await expect(preview.locator("code.language-bash")).toContainText('echo "hello"');
  await expect(preview.locator(".markdown-code-label").nth(1)).toHaveText("src/example.js");
  await expect(preview.locator(".markdown-code-language").nth(0)).toHaveText("JavaScript");
  await expect(preview.locator("code.language-javascript .hljs-keyword")).toHaveText("const");
});

test("opens ordinary Markdown links and delegates custom protocols", async ({ page }) => {
  const block = page.locator(blockTypeSelector("paragraph")).first();
  const editor = block.locator(":scope > .page-block-row .markdown-editor");
  const preview = block.locator(":scope > .page-block-row .markdown-preview");
  await editor.click();
  await editor.evaluate((element) => {
    element.textContent = "[Browser](#markdown-target) [Local](chulane:page/example)";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    (element as HTMLElement).blur();
  });
  await page.evaluate(() => {
    window.addEventListener("rivto:markdown-link", ((event: CustomEvent<string>) => {
      (window as typeof window & { markdownLink?: string }).markdownLink = event.detail;
    }) as EventListener, { once: true });
  });

  await preview.getByRole("link", { name: "Browser" }).click();
  await expect(page).toHaveURL(/#markdown-target$/);
  await preview.getByRole("link", { name: "Local" }).click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { markdownLink?: string }
  ).markdownLink)).toBe("chulane:page/example");
  await expect(page).toHaveURL(/#markdown-target$/);
});

test("scrolls Markdown code without opening the raw editor", async ({ page }) => {
  const block = page.locator(blockTypeSelector("paragraph")).first();
  const editor = block.locator(":scope > .page-block-row .markdown-editor");
  const preview = block.locator(":scope > .page-block-row .markdown-preview");

  await editor.click();
  await editor.evaluate((element) => {
    element.textContent = `\`\`\`text\n${"const value = 42; ".repeat(40)}\n\`\`\``;
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    (element as HTMLElement).blur();
  });

  const code = preview.locator("pre");
  await expect.poll(() => code.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeGreaterThan(100);
  const box = await code.boundingBox();
  if (!box) throw new Error("Expected rendered code block");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(300, 0);

  await expect(preview).toBeVisible();
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const sourceBeforeEdit = await editor.textContent();
  const editableCode = code.locator(".markdown-code-editor");
  await code.evaluate((element) => { element.scrollLeft = 0; });
  const codeBox = await editableCode.boundingBox();
  if (!codeBox) throw new Error("Expected editable code");
  await page.mouse.move(codeBox.x + 10, codeBox.y + codeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(codeBox.x + 130, codeBox.y + codeBox.height / 2);
  await page.mouse.up();
  await expect(editableCode).toBeFocused();
  await expect(preview).toBeVisible();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString().length ?? 0))
    .toBeGreaterThan(0);
  await page.keyboard.insertText("Z");
  await page.keyboard.type("ABC");
  await expect(editableCode).toBeFocused();
  await expect.poll(() => editor.textContent()).toContain("ZABC");
  await expect.poll(async () => (await editor.textContent())?.length)
    .toBeLessThanOrEqual((sourceBeforeEdit?.length ?? 0) + 3);
});

test("preserves a newer Markdown edit when code input arrives before React rerenders", async ({ page }) => {
  const block = page.locator(blockTypeSelector("paragraph")).first();
  const id = await block.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!id) throw new Error("Expected block ID");
  const editor = block.locator(":scope > .page-block-row .markdown-editor");
  const code = block.locator(`.${MARKDOWN_CODE_EDITOR_CLASS}`);
  const source = "```text\nold\n```\n\nOriginal tail";
  const newer = "```text\nold\n```\n\nNewer tail";

  await page.evaluate(({ blockId, content }) => {
    const core = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor;
    core.blocks.updateBlock(blockId, { content });
  }, { blockId: id, content: source });
  await expect(code).toHaveText("old");

  // An external write and the existing input handler can run in one browser
  // turn. React has not committed a new callback yet, so this catches edits
  // built from the previous render's whole Markdown string.
  // If this fails, read the current block content inside updateCode before
  // replacing code; also recheck the fence position if earlier text shifted.
  await code.evaluate((element, { blockId, content }) => {
    const core = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor;
    core.blocks.updateBlock(blockId, { content });
    element.textContent = "edited";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, { blockId: id, content: newer });

  await expect(editor).toHaveText("```text\nedited\n```\n\nNewer tail");
});

test("filters typo queries, converts in place, and undoes query removal with conversion", async ({ page }) => {
  const content = page.locator("[data-block-content]").last();
  const block = content.locator(BLOCK_ANCESTOR_XPATH);
  const id = await block.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!id) throw new Error("Expected block ID");

  await content.click();
  const editor = block.locator("[data-block-content]");
  const initial = await editor.textContent();
  await page.keyboard.press("End");
  await page.keyboard.type("/sloder");
  const menu = page.locator("[data-slash-menu]");
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-slash-command="type.demo.slider"]')).toBeVisible();
  await page.keyboard.press("Enter");

  const converted = page.locator(blockIdSelector(id));
  await expect(converted).toHaveAttribute("data-block-type", "demo.slider");
  await converted.locator("[data-block-content]").click();
  await expect(converted.locator("[data-block-content]")).toHaveText(initial ?? "");
  await expect(menu).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(converted).toHaveAttribute("data-block-type", "paragraph");
  await converted.locator("[data-block-content]").click();
  await expect(converted.locator("[data-block-content]")).toHaveText(`${initial}/sloder`);
});

test("executes the highlighted command after grouped slash navigation", async ({ page }) => {
  const editor = page.locator("[data-block-content]").last();
  const block = editor.locator(BLOCK_ANCESTOR_XPATH);
  const id = await block.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!id) throw new Error("Expected block ID");
  const kanbanCount = await page.locator(blockTypeSelector("kanban")).count();

  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/c");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-active]")).toHaveAttribute("data-slash-command", "block.delete");
  await page.keyboard.press("Enter");

  await expect(page.locator(blockIdSelector(id))).toHaveCount(0);
  await expect(page.locator(blockTypeSelector("kanban"))).toHaveCount(kanbanCount);
});

test("Escape preserves slash text and custom controls update or select their block", async ({ page }) => {
  const editor = page.locator("[data-block-content]").last();
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /count");
  await expect(page.locator("[data-slash-menu]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slash-menu]")).toHaveCount(0);
  await expect(editor).toContainText("/count");

  await page.keyboard.type(" /qq");
  await expect(page.locator("[data-slash-menu]")).toContainText("No matching commands");
  await page.keyboard.type("x");
  await expect(page.locator("[data-slash-menu]")).toHaveCount(0);
  await expect(editor).toContainText("/qqx");

  const counter = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.counter")}`);
  const button = counter.locator(".custom-counter-block");
  await expect(button).toHaveText("Count: 2");
  await button.click();
  await expect(button).toHaveText("Count: 3");
  await page.keyboard.press("Control+z");
  await expect(button).toHaveText("Count: 2");
  await page.keyboard.press("Control+y");
  await expect(button).toHaveText("Count: 3");
  await button.click({ modifiers: ["Control"] });
  await expect(counter).toHaveAttribute("data-block-selected", "true");
  await expect(button).toHaveText("Count: 3");
});

test("mouse slash execution creates a contentless Counter and undo restores dormant text", async ({ page }) => {
  const content = page.locator("[data-block-content]").last();
  const block = content.locator(BLOCK_ANCESTOR_XPATH);
  const id = await block.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!id) throw new Error("Expected block ID");

  await content.click();
  const editor = block.locator("[data-block-content]");
  const initial = await editor.textContent();
  await page.keyboard.press("End");
  await page.keyboard.type(" /count");
  await page.locator('[data-slash-command="type.demo.counter"]').click();
  const converted = page.locator(blockIdSelector(id));
  await expect(converted).toHaveAttribute("data-block-type", "demo.counter");
  await expect(converted.locator("[data-block-content]")).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(converted).toHaveAttribute("data-block-type", "paragraph");
  await converted.locator("[data-block-content]").click();
  await expect(converted.locator("[data-block-content]")).toHaveText(`${initial} /count`);
});

test("Slider property changes use editor history", async ({ page }) => {
  const slider = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.slider")} input[type="range"]`);
  await expect(slider).toHaveValue("35");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("36");
  await page.keyboard.press("Control+z");
  await expect(slider).toHaveValue("35");
  await page.keyboard.press("Control+Shift+z");
  await expect(slider).toHaveValue("36");
});

test("Slider commits a drag as one history step", async ({ page }) => {
  const slider = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.slider")} input[type="range"]`);
  await expect(slider).toHaveValue("35");
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  if (!box) throw new Error("Expected the slider to be visible");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.35, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, y, { steps: 12 });
  const dragged = Number(await slider.inputValue());
  expect(dragged).toBeGreaterThan(35);
  await page.mouse.up();
  await expect(slider).toHaveValue(String(dragged));
  await page.keyboard.press("Control+z");
  await expect(slider).toHaveValue("35");
});
