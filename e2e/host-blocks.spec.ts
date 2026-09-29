import { expect, test, type Locator, type Page } from "@playwright/test";
import { blockIdSelector } from "./dom-markers";

const TODAY = "[data-journal-document=\"today\"]";

interface InsertedBlock {
  id: string;
  childIds: string[];
}

interface ClipboardFlavors {
  html: string;
  markdown: string;
  structured: string;
  text: string;
}

async function insertBlock(
  page: Page,
  input: Record<string, unknown>,
  afterId?: string | null,
): Promise<InsertedBlock> {
  return page.evaluate(({ block, after }) => {
    const editor = (window as unknown as {
      __rivtoDemo: {
        editor: {
          blocks: {
            insertBlock: (value: Record<string, unknown>, anchor?: string | null) => {
              id: string;
              children: { id: string }[];
            };
          };
        };
      };
    }).__rivtoDemo.editor;
    const inserted = editor.blocks.insertBlock(block, after);
    return { id: inserted.id, childIds: inserted.children.map((child) => child.id) };
  }, { block: input, after: afterId });
}

async function blockProps(page: Page, id: string): Promise<Record<string, unknown>> {
  return page.evaluate((blockId) => {
    const props = (window as unknown as {
      __rivtoDemo: { editor: { blocks: { getBlockNode: (value: string) => { props: Record<string, unknown> } | undefined } } };
    }).__rivtoDemo.editor.blocks.getBlockNode(blockId)?.props;
    if (!props) throw new Error(`Missing block ${blockId}`);
    return props;
  }, id);
}

async function undo(page: Page): Promise<void> {
  await page.locator("[data-editor-action=\"undo\"]").click();
}

/** Ends the current Yjs capture so the next edit is its own undo step. */
async function stopCapturing(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as {
      __rivtoDemo: { editor: { history: { stopCapturing: () => void } } };
    }).__rivtoDemo.editor.history.stopCapturing();
  });
}

async function copySelection(page: Page): Promise<ClipboardFlavors> {
  await page.evaluate(() => {
    document.addEventListener("copy", (event) => {
      (window as unknown as { hostCopy?: ClipboardFlavors }).hostCopy = {
        html: event.clipboardData?.getData("text/html") ?? "",
        markdown: event.clipboardData?.getData("text/markdown") ?? "",
        structured: event.clipboardData?.getData("application/x-rivto+json") ?? "",
        text: event.clipboardData?.getData("text/plain") ?? "",
      };
    }, { once: true });
  });
  await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { hostCopy?: ClipboardFlavors }
  ).hostCopy)).toBeTruthy();
  return page.evaluate(() => (window as unknown as { hostCopy: ClipboardFlavors }).hostCopy);
}

async function pasteStructured(content: Locator, structured: string, plain: string): Promise<void> {
  await content.evaluate((element, payload) => {
    const data = new DataTransfer();
    data.setData("application/x-rivto+json", payload.structured);
    data.setData("text/plain", payload.plain);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    element.dispatchEvent(event);
  }, { structured, plain });
}

function block(page: Page, id: string): Locator {
  return page.locator(TODAY).locator(blockIdSelector(id));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("slash conversion adds the host blocks and preserves unrelated content", async ({ page }) => {
  const blank = await insertBlock(page, { type: "paragraph", content: "" });
  const noisy = await insertBlock(page, { type: "paragraph", content: "Keep this sentence" });
  const saved = await insertBlock(page, {
    type: "paragraph",
    content: "Saved title",
    children: [{ type: "paragraph", content: "Kept child" }],
  });
  const blankRow = block(page, blank.id);
  await blankRow.locator("[data-block-content]").click();
  await page.keyboard.type("/toc");
  const tocCommand = page.locator("[data-slash-command=\"type.demo.table-of-contents\"]");
  await expect(tocCommand).toBeVisible();
  await tocCommand.click();
  await expect(blankRow).toHaveAttribute("data-block-type", "demo.table-of-contents");
  await expect(blankRow).toHaveAttribute("data-block-id", blank.id);
  await undo(page);
  await expect(blankRow).toHaveAttribute("data-block-type", "paragraph");
  await expect(blankRow.locator("[data-block-content]")).toHaveText("/toc");

  const noisyContent = block(page, noisy.id).locator("[data-block-content]");
  await noisyContent.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/toc");
  await expect(tocCommand).toHaveCount(0);

  const savedRow = block(page, saved.id);
  const savedContent = savedRow.locator(":scope > .page-block-row [data-block-content]");
  await savedContent.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/callout");
  await page.locator("[data-slash-command=\"type.demo.callout\"]").click();
  await expect(savedRow).toHaveAttribute("data-block-type", "demo.callout");
  await expect(savedRow).toHaveAttribute("data-block-id", saved.id);
  await expect(savedContent).toHaveText("Saved title");
  await expect(block(page, saved.childIds[0]!).locator("[data-block-content]")).toHaveText("Kept child");

  const bookmark = await insertBlock(page, { type: "paragraph", content: "" });
  const equation = await insertBlock(page, { type: "paragraph", content: "" });
  await block(page, bookmark.id).locator("[data-block-content]").click();
  await page.keyboard.type("/bookmark");
  await page.locator("[data-slash-command=\"type.demo.bookmark\"]").click();
  await expect(block(page, bookmark.id)).toHaveAttribute("data-block-type", "demo.bookmark");
  await block(page, equation.id).locator("[data-block-content]").click();
  await page.keyboard.type("/math");
  await page.locator("[data-slash-command=\"type.demo.math-equation\"]").click();
  await expect(block(page, equation.id)).toHaveAttribute("data-block-type", "demo.math-equation");
});

test("edits a callout and undoes tone, emoji, and body changes", async ({ page }) => {
  const callout = await insertBlock(page, {
    type: "demo.callout",
    content: "Body text",
    props: { variant: "note", emoji: "💡" },
  });
  const row = block(page, callout.id);
  const variant = row.getByLabel("Variant");
  await variant.selectOption("warning");
  await expect(variant).toHaveValue("warning");
  await expect(row.locator("[data-callout-variant]")).toHaveAttribute("data-callout-variant", "warning");
  await undo(page);
  await expect(variant).toHaveValue("note");

  const emoji = row.getByLabel("Emoji");
  await emoji.fill("🔥");
  await emoji.blur();
  await expect(emoji).toHaveValue("🔥");
  await undo(page);
  await expect(emoji).toHaveValue("💡");

  const body = row.locator("[data-block-content]");
  await body.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(body).toHaveText("Body text!");
  await undo(page);
  await expect(body).toHaveText("Body text");
});

test("submits bookmark links and keeps invalid or partial URLs uncommitted", async ({ page }) => {
  const bookmark = await insertBlock(page, {
    type: "demo.bookmark",
    content: "Rivto docs",
    props: { url: "", description: "" },
  });
  const row = block(page, bookmark.id);
  const url = row.getByLabel("URL");
  await expect(url).toBeVisible();
  await expect(row.getByRole("link")).toHaveCount(0);

  await url.fill("https://riv");
  await expect.poll(() => blockProps(page, bookmark.id)).toMatchObject({ url: "" });
  await url.fill("javascript:alert(1)");
  await row.getByRole("button", { name: "Save link" }).click();
  await expect(row.getByRole("alert")).toHaveText("Enter an HTTP or HTTPS URL.");
  await expect.poll(() => blockProps(page, bookmark.id)).toMatchObject({ url: "" });
  await expect(row.getByRole("link")).toHaveCount(0);

  await url.fill("https://rivto.example/docs");
  await row.getByRole("button", { name: "Save link" }).click();
  const link = row.getByRole("link", { name: "https://rivto.example/docs" });
  await expect(link).toHaveAttribute("href", "https://rivto.example/docs");
  await expect.poll(() => blockProps(page, bookmark.id)).toMatchObject({
    url: "https://rivto.example/docs",
  });
  await stopCapturing(page);

  const description = row.getByLabel("Description");
  await description.fill("A manual note");
  await description.blur();
  await expect.poll(() => blockProps(page, bookmark.id)).toMatchObject({
    description: "A manual note",
  });
  await undo(page);
  await expect(description).toHaveValue("");
  await undo(page);
  await expect(row.getByRole("link")).toHaveCount(0);
  await expect(url).toHaveValue("");
  await expect.poll(() => blockProps(page, bookmark.id)).toMatchObject({ url: "" });
});

test("updates a table of contents and navigates to its heading", async ({ page }) => {
  const section = await insertBlock(page, {
    type: "paragraph",
    content: "# Section",
    children: [
      { type: "demo.table-of-contents", content: "" },
      { type: "paragraph", content: "## Alpha\n\n```\n# Hidden\n```" },
      { type: "demo.callout", content: "# From callout", props: { variant: "note", emoji: "💡" } },
    ],
  }, null);
  const outside = await insertBlock(page, { type: "paragraph", content: "# Outside" });
  const tocId = section.childIds[0]!;
  const alphaId = section.childIds[1]!;
  const toc = block(page, tocId);
  await expect(toc.getByRole("button", { name: "Section" })).toBeVisible();
  await expect(toc.getByRole("button", { name: "Alpha" })).toBeVisible();
  await expect(toc.getByRole("button", { name: "From callout" })).toBeVisible();
  await expect(toc.getByRole("button", { name: "Hidden" })).toHaveCount(0);
  await expect(toc.getByRole("button", { name: "Outside" })).toHaveCount(0);

  await page.evaluate((id) => {
    (window as unknown as {
      __rivtoDemo: { editor: { blocks: { updateBlock: (blockId: string, patch: { content: string }) => void } } };
    }).__rivtoDemo.editor.blocks.updateBlock(id, { content: "## Renamed" });
  }, alphaId);
  await expect(toc.getByRole("button", { name: "Renamed" })).toBeVisible();
  await expect(toc.getByRole("button", { name: "Alpha" })).toHaveCount(0);

  await page.evaluate((id) => {
    const blocks = (window as unknown as {
      __rivtoDemo: { editor: { blocks: {
        getRootIds: () => string[];
        moveBlock: (blockId: string, targetId: string, position: "before") => void;
      } } };
    }).__rivtoDemo.editor.blocks;
    blocks.moveBlock(id, blocks.getRootIds()[0]!, "before");
  }, tocId);
  await expect(block(page, tocId).getByRole("button", { name: "Outside" })).toBeVisible();

  const collapsed = await insertBlock(page, {
    type: "paragraph",
    content: "Collapsed section",
    children: [{ type: "paragraph", content: "# Scroll target heading" }],
  });
  await page.evaluate((id) => {
    (window as unknown as {
      __rivtoDemo: { editor: { blocks: { updateBlock: (blockId: string, patch: { listProps: { collapsed: boolean } }) => void } } };
    }).__rivtoDemo.editor.blocks.updateBlock(id, { listProps: { collapsed: true } });
  }, collapsed.id);
  const heading = block(page, collapsed.childIds[0]!);
  await expect(heading).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  const scrollY = await page.evaluate(() => window.scrollY);
  await block(page, tocId).getByRole("button", { name: "Scroll target heading" }).click();
  await expect(heading).toBeVisible();
  await expect.poll(async () => {
    const box = await heading.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) return false;
    return box.y >= 0 && box.y < viewport.height;
  }).toBe(true);
  expect(scrollY).toBe(0);

  await page.evaluate((id) => {
    (window as unknown as {
      __rivtoDemo: { editor: { blocks: { updateBlock: (blockId: string, patch: { listProps: { collapsed: boolean } }) => void } } };
    }).__rivtoDemo.editor.blocks.updateBlock(id, { listProps: { collapsed: true } });
  }, collapsed.id);
  await page.locator("[data-editor-mode=\"edgeless\"]").click();
  const viewport = page.locator(".edgeless-viewport");
  const panX = await viewport.getAttribute("data-edgeless-pan-x");
  const panY = await viewport.getAttribute("data-edgeless-pan-y");
  const zoom = await viewport.getAttribute("data-edgeless-zoom");
  await block(page, tocId).getByRole("button", { name: "Scroll target heading" }).click({ force: true });
  await expect(heading).toHaveCount(1);
  await expect(viewport).toHaveAttribute("data-edgeless-pan-x", panX ?? "");
  await expect(viewport).toHaveAttribute("data-edgeless-pan-y", panY ?? "");
  await expect(viewport).toHaveAttribute("data-edgeless-zoom", zoom ?? "");
  expect(outside.id).not.toBe(tocId);
});

test("renders valid math and keeps an invalid formula editable", async ({ page }) => {
  const equation = await insertBlock(page, { type: "demo.math-equation", content: "E=mc^2" });
  const row = block(page, equation.id);
  await expect(row.locator(".katex")).toBeVisible();
  await expect(row.locator(".katex-display")).toBeVisible();
  await expect(row.locator(".katex-error")).toHaveCount(0);
  await expect(row.getByRole("alert")).toHaveCount(0);

  const source = row.getByRole("textbox", { name: "Equation source" });
  await source.click();
  await source.evaluate((element) => {
    element.textContent = "\\frac{";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  });
  await expect(row.locator(".katex-error")).toBeVisible();
  await expect(row.getByRole("alert")).toHaveText("Invalid formula");
  await expect(source).toHaveText("\\frac{");
  await stopCapturing(page);
  await source.press("End");
  await page.keyboard.type("x");
  await expect(source).toHaveText("\\frac{x");
  await undo(page);
  await undo(page);
  await expect(source).toHaveText("E=mc^2");
  await expect(row.locator(".katex-error")).toHaveCount(0);
});

test("copies host blocks as structured data and portable text", async ({ page }) => {
  const callout = await insertBlock(page, {
    type: "demo.callout",
    content: "Remember this",
    props: { variant: "tip", emoji: "✅" },
  });
  const bookmark = await insertBlock(page, {
    type: "demo.bookmark",
    content: "Docs",
    props: { url: "https://example.com/docs", description: "Manual" },
  });
  const section = await insertBlock(page, {
    type: "paragraph",
    content: "# Copied heading",
    children: [{ type: "demo.table-of-contents", content: "" }],
  });
  const equation = await insertBlock(page, { type: "demo.math-equation", content: "E=mc^2" });
  const cases = [
    {
      id: callout.id,
      type: "demo.callout",
      props: { variant: "tip", emoji: "✅" },
      content: "Remember this",
      markdown: "> [!TIP]",
    },
    {
      id: bookmark.id,
      type: "demo.bookmark",
      props: { url: "https://example.com/docs", description: "Manual" },
      content: "Docs",
      markdown: "[Docs](https://example.com/docs)",
    },
    {
      id: section.childIds[0]!,
      type: "demo.table-of-contents",
      props: {},
      content: "",
      markdown: "- Copied heading",
    },
    {
      id: equation.id,
      type: "demo.math-equation",
      props: {},
      content: "E=mc^2",
      markdown: "$$\nE=mc^2\n$$",
    },
  ];

  for (const item of cases) {
    const row = block(page, item.id);
    const content = row.locator("[data-block-content]");
    await (await content.count() ? content : row).click({ modifiers: ["Control"] });
    await expect(row).toHaveAttribute("data-block-selected", "true");
    const flavors = await copySelection(page);
    const bundle = JSON.parse(flavors.structured) as { blocks: Array<Record<string, unknown>> };
    expect(bundle.blocks[0]).toMatchObject({
      type: item.type,
      content: item.content,
      props: item.props,
    });
    expect(flavors.markdown).toContain(item.markdown);
    expect(flavors.text.length).toBeGreaterThan(0);

    const target = page.locator(`${TODAY} [data-block-content]`).last();
    await target.click();
    const before = await page.locator(`${TODAY} [data-block-type="${item.type}"]`).count();
    await pasteStructured(target, flavors.structured, flavors.text);
    await expect(page.locator(`${TODAY} [data-block-type="${item.type}"]`)).toHaveCount(before + 1);
    await undo(page);
    await expect(page.locator(`${TODAY} [data-block-type="${item.type}"]`)).toHaveCount(before);
  }
});

test("selects host blocks on the page and the canvas", async ({ page }) => {
  const callout = await insertBlock(page, {
    type: "demo.callout",
    content: "Selectable callout",
    props: { variant: "note", emoji: "💡" },
  });
  const bookmark = await insertBlock(page, {
    type: "demo.bookmark",
    content: "Selectable bookmark",
    props: { url: "", description: "" },
  });
  const contents = await insertBlock(page, { type: "demo.table-of-contents", content: "" });
  const equation = await insertBlock(page, { type: "demo.math-equation", content: "a+b" });
  const ids = [callout.id, bookmark.id, contents.id, equation.id];

  for (const mode of ["block", "edgeless"] as const) {
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    await page.evaluate(() => {
      (window as unknown as {
        __rivtoDemo: { editor: { selection: { clear: () => void } } };
      }).__rivtoDemo.editor.selection.clear();
    });
    for (const id of ids) {
      const row = block(page, id);
      const content = row.locator(":scope > .page-block-row [data-block-content]");
      const anchor = (await content.count()) > 0 ? content : row.locator(".demo-toc");
      await anchor.click({ modifiers: ["Control"], force: mode === "edgeless" });
      await expect(row).toHaveAttribute("data-block-selected", "true");
    }
  }
});
