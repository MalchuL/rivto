/**
 * Covers the opt-in OpenUI block in the journal demo: drawn examples stay
 * visual until Edit is used, and Draw writes the edited program back.
 *
 * @module
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const OPENUI_SOURCE = `root = Stack([title])
title = TextContent("Hello OpenUI", "large-heavy")`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

/**
 * Resolves a character offset inside one editable block to a viewport point.
 *
 * @param content - Content host that owns the text node.
 * @param offset - Character offset within that text node.
 * @returns A point on the requested character.
 */
async function textPoint(content: Locator, offset: number): Promise<{ x: number; y: number }> {
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

/**
 * Replaces today's journal with a short outline around one OpenUI block.
 *
 * @param page - Browser page that has loaded the demo.
 * @param source - OpenUI program stored on the middle block.
 * @returns Stable IDs for the fixture blocks.
 */
async function loadOpenUiOutline(page: Page, source = OPENUI_SOURCE): Promise<{
  before: string;
  openui: string;
  child: string;
  after: string;
}> {
  return page.evaluate((program) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    const before = editor.blocks.insertBlock({ type: "paragraph", content: "Before OpenUI" }).id;
    const openui = editor.blocks.insertBlock({
      type: "openui",
      content: program,
      children: [{ type: "paragraph", content: "Nested note" }],
    }).id;
    const after = editor.blocks.insertBlock({ type: "paragraph", content: "After OpenUI" }).id;
    const openUiBlock = editor.blocks.getBlock(openui)!;
    editor.load({
      ...editor.dump(),
      blocks: [
        editor.blocks.getBlock(before)!,
        openUiBlock,
        editor.blocks.getBlock(after)!,
      ],
      elements: [],
    });
    return {
      before,
      openui,
      child: openUiBlock.children[0]!.id,
      after,
    };
  }, source);
}

test("draws seeded OpenUI programs and edits one through the Draw control", async ({ page }) => {
  const document = page.locator('[data-journal-document="today"]');
  const blocks = document.locator('[data-block-type="openui"]');
  await expect(blocks).toHaveCount(3);

  const table = blocks.nth(0);
  const chart = blocks.nth(1);
  const form = blocks.nth(2);
  await expect(table).toContainText("Top Languages");
  await expect(table).toContainText("TypeScript");
  await expect(chart).toContainText("Q4 Revenue");
  await expect(form).toContainText("Contact Us");
  await expect(form.getByRole("button", { name: "Submit", exact: true })).toBeVisible();
  await expect(table.locator("textarea")).toHaveCount(0);

  await table.getByText("Python").click();
  await expect(table.locator("[data-openui-mode]")).toHaveAttribute("data-openui-mode", "draw");
  await expect(table.locator("textarea")).toHaveCount(0);

  await table.getByRole("button", { name: "Edit OpenUI source" }).click();
  const source = table.getByRole("textbox", { name: "OpenUI source" });
  await expect(source).toBeVisible();
  await expect(table.locator("[data-openui-mode]")).toHaveAttribute("data-openui-mode", "edit");
  const value = await source.inputValue();
  await source.fill(value.replace("Top Languages", "Edited Languages"));
  await table.getByRole("button", { name: "Draw OpenUI source" }).click();

  await expect(table.locator("[data-openui-mode]")).toHaveAttribute("data-openui-mode", "draw");
  await expect(table).toContainText("Edited Languages");
  await expect(table.locator("textarea")).toHaveCount(0);
  await expect(chart).toContainText("Q4 Revenue");
});

test("selects an OpenUI block from its drawing and from a neighboring drag", async ({ page }) => {
  const ids = await loadOpenUiOutline(page);
  const document = page.locator('[data-journal-document="today"]');
  const openui = document.locator(`[data-block-id="${ids.openui}"]`);
  const before = document.locator(`[data-block-id="${ids.before}"] [data-block-content]`);
  const after = document.locator(`[data-block-id="${ids.after}"] [data-block-content]`);

  await openui.getByText("Hello OpenUI").click();
  await expect(openui).toHaveAttribute("data-block-selected", "true");
  await expect(openui.locator("[data-openui-mode]")).toHaveAttribute("data-openui-mode", "draw");
  await expect(openui.locator("textarea")).toHaveCount(0);
  await expect(document.locator("[data-block-selected]")).toHaveCount(1);

  const from = await textPoint(before, 2);
  const box = await openui.boundingBox();
  if (!box) throw new Error("Expected OpenUI geometry");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 36, { steps: 8 });
  await page.mouse.up();
  await expect(document.locator(`[data-block-id="${ids.before}"]`)).toHaveAttribute("data-block-selected", "true");
  await expect(openui).toHaveAttribute("data-block-selected", "true");
  await expect(document.locator(`[data-block-id="${ids.after}"]`)).not.toHaveAttribute("data-block-selected", "true");

  await openui.getByText("Hello OpenUI").click();
  const afterPoint = await textPoint(after, 2);
  const again = await openui.boundingBox();
  if (!again) throw new Error("Expected OpenUI geometry");
  await page.mouse.move(again.x + again.width / 2, again.y + 36);
  await page.mouse.down();
  await page.mouse.move(afterPoint.x, afterPoint.y, { steps: 8 });
  await page.mouse.up();
  await expect(openui).toHaveAttribute("data-block-selected", "true");
  await expect(document.locator(`[data-block-id="${ids.after}"]`)).toHaveAttribute("data-block-selected", "true");
  await expect(document.locator(`[data-block-id="${ids.child}"]`)).toHaveAttribute("data-block-selected", "true");
});

test("keeps a nested child selectable, collapsible, and indentable under OpenUI", async ({ page }) => {
  const ids = await loadOpenUiOutline(page);
  const document = page.locator('[data-journal-document="today"]');
  const openui = document.locator(`[data-block-id="${ids.openui}"]`);
  const child = document.locator(`[data-block-id="${ids.child}"]`);

  await expect(openui.locator(":scope > .page-block-children").locator(`[data-block-id="${ids.child}"]`)).toBeVisible();
  await child.locator("[data-block-content]").click();
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.selection.get()?.focusBlockId;
  })).toBe(ids.child);
  await expect(child.locator("[data-block-content]")).toBeFocused();
  await expect(openui).not.toHaveAttribute("data-block-selected", "true");

  await openui.locator(":scope > .page-block-row [data-collapse-toggle]").click();
  await expect(child).toBeHidden();
  await openui.locator(":scope > .page-block-row [data-collapse-toggle]").click();
  await expect(child).toBeVisible();

  const after = document.locator(`[data-block-id="${ids.after}"] [data-block-content]`);
  await after.click();
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate((id) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.blocks.getParentId(id);
  }, ids.after)).toBe(ids.openui);
  await expect(openui.locator(":scope > .page-block-children").locator(`[data-block-id="${ids.after}"]`)).toBeVisible();

  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => page.evaluate((id) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.blocks.getParentId(id);
  }, ids.after)).toBeNull();

  await openui.getByText("Hello OpenUI").click();
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.selection.get()?.focusBlockId;
  })).toBe(ids.child);
  await page.keyboard.press("ArrowUp");
  await expect(openui).toHaveAttribute("data-block-selected", "true");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.selection.get()?.blocks.map((block) => block.id) ?? [];
  })).toEqual([ids.openui, ids.child]);
});

test("draws OpenUI inside a column and deletes a selected block with undo", async ({ page }) => {
  const ids = await page.evaluate((source) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    const columns = editor.blocks.insertBlock({
      type: "columns",
      children: [
        {
          type: "columns-column",
          children: [{ type: "openui", content: source }],
        },
        {
          type: "columns-column",
          children: [{ type: "paragraph", content: "Beside OpenUI" }],
        },
      ],
    }).id;
    const columnsBlock = editor.blocks.getBlock(columns)!;
    editor.load({ ...editor.dump(), blocks: [columnsBlock], elements: [] });
    return {
      columns,
      openui: columnsBlock.children[0]!.children[0]!.id,
      beside: columnsBlock.children[1]!.children[0]!.id,
    };
  }, OPENUI_SOURCE);

  const document = page.locator('[data-journal-document="today"]');
  const openui = document.locator(`[data-block-id="${ids.openui}"]`);
  const beside = document.locator(`[data-block-id="${ids.beside}"]`);
  await expect(openui.getByText("Hello OpenUI")).toBeVisible();
  const openuiBox = await openui.boundingBox();
  const besideBox = await beside.boundingBox();
  if (!openuiBox || !besideBox) throw new Error("Expected column geometry");
  expect(openuiBox.width).toBeLessThan(besideBox.x);

  await openui.getByText("Hello OpenUI").click();
  await expect(openui).toHaveAttribute("data-block-selected", "true");
  await page.keyboard.press("Backspace");
  await expect(openui).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(document.locator(`[data-block-id="${ids.openui}"]`)).toContainText("Hello OpenUI");
});

test("copies a selected OpenUI block with its nested child", async ({ page }) => {
  const ids = await loadOpenUiOutline(page);
  const document = page.locator('[data-journal-document="today"]');
  const openui = document.locator(`[data-block-id="${ids.openui}"]`);
  await openui.getByText("Hello OpenUI").click();
  await page.evaluate(() => {
    document.addEventListener("copy", (event) => {
      (window as typeof window & { openUiCopy?: string }).openUiCopy = event.clipboardData?.getData("text/plain") ?? "";
    }, { once: true });
  });
  await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { openUiCopy?: string }
  ).openUiCopy)).toContain("Hello OpenUI");
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { openUiCopy?: string }
  ).openUiCopy)).toContain("Nested note");

  const before = await document.locator("[data-block-type='openui']").count();
  await page.keyboard.press("Control+v");
  await expect(document.locator("[data-block-type='openui']")).toHaveCount(before + 1);
  await expect(document.locator("[data-block-content]", { hasText: "Nested note" })).toHaveCount(2);
});

test("drops a sibling inside an OpenUI block", async ({ page }) => {
  const ids = await loadOpenUiOutline(page);
  const document = page.locator('[data-journal-document="today"]');
  const openui = document.locator(`[data-block-id="${ids.openui}"]`);
  const after = document.locator(`[data-block-id="${ids.after}"]`);
  const handle = after.locator(":scope > .page-block-row .page-drag-handle");
  await after.locator(":scope > .page-block-row").hover();
  const from = await handle.boundingBox();
  const target = await openui.locator(":scope > .page-block-row").boundingBox();
  if (!from || !target) throw new Error("Expected drag geometry");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await expect(page.locator(".page-drop-indicator")).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => page.evaluate((id) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.blocks.getParentId(id);
  }, ids.after)).toBe(ids.openui);
});
