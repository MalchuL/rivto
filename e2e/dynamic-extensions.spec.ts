import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Opens four dynamically loaded block types on one editor surface.
 *
 * @param page - Browser page receiving the demo fixture.
 * @param mode - Surface displaying the fixture.
 * @returns Resolves after the fixture and requested surface are ready.
 */
async function openFixture(page: Page, mode: "block" | "edgeless") {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/?test_features=1");
  await expect(page.locator('[data-journal-document="today"] > .page-surface')).toBeVisible();
  await page.evaluate((surface) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const blocks = [
      { type: "dynamic.counter", props: { count: 0 } },
      { type: "dynamic.accordion" },
      { type: "dynamic.note", content: "Editable note" },
      { type: "dynamic.status", props: { done: false } },
      { type: "paragraph", content: "Move into accordion" },
    ].map((block) => editor.blocks.insertBlock(block).id);
    editor.load({
      ...editor.dump(),
      rootElementIds: [],
      blocks: blocks.map((id) => editor.blocks.getBlock(id)!),
      elements: [],
    });
    if (surface === "edgeless") {
      editor.elements.insertElement({
        type: "block",
        zIndex: 0,
        frame: { x: 20, y: 20, width: 900, height: 650 },
        props: { startBlockId: blocks[0], endBlockId: blocks[blocks.length - 1] },
      });
    }
  }, mode);
  await page.locator(`[data-editor-mode="${mode}"]`).click();
  await expect(page.locator('[data-block-type="dynamic.counter"]')).toBeVisible();
}

/**
 * Reads a block's current parent through the demo document editor.
 *
 * @param page - Demo page containing the editor.
 * @param blockId - Block whose placement is inspected.
 * @returns Current parent ID, or null when the block is at the root.
 */
async function parentId(page: Page, blockId: string) {
  return page.evaluate(
    (id) =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getParentId(id),
    blockId,
  );
}

/**
 * Applies one undo or redo operation to the demo document.
 *
 * @param page - Demo page containing the editor.
 * @param action - History operation to invoke.
 * @returns Resolves after the history operation has run.
 */
async function applyHistory(page: Page, action: "undo" | "redo") {
  await page.evaluate((operation) => {
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.history[operation]();
  }, action);
}

for (const mode of ["block", "edgeless"] as const) {
  test(`loads JavaScript blocks and preserves control and selection gestures in ${mode}`, async ({
    page,
  }) => {
    await openFixture(page, mode);
    const counter = page.locator('[data-block-type="dynamic.counter"]');
    const button = counter.getByRole("button", { name: /^Dynamic count:/ });
    const region = counter.locator(".dynamic-counter");
    const regionBox = (await region.boundingBox())!;
    await region.click({ position: { x: regionBox.width - 8, y: regionBox.height / 2 } });
    await expect(counter).toHaveAttribute("data-block-selected", "true");
    await expect(button).toHaveText("Dynamic count: 0");
    await expect
      .poll(() => region.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe(await counter.evaluate((node) => getComputedStyle(node).backgroundColor));
    await button.click();
    await expect(button).toHaveText("Dynamic count: 1");
    await button.focus();
    await button.press("Enter");
    await expect(button).toHaveText("Dynamic count: 2");
    await button.click({ modifiers: ["Control"] });
    await expect(button).toHaveText("Dynamic count: 2");
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 - 8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(counter).toHaveAttribute("data-block-selected", "true");
    await expect(button).toHaveText("Dynamic count: 2");
  });

  test(`selects container and status and edits text in ${mode}`, async ({ page }) => {
    await openFixture(page, mode);
    const accordion = page.locator('[data-block-type="dynamic.accordion"]');
    const accordionHeader = accordion.locator(".dynamic-accordion-header");
    const accordionBox = (await accordionHeader.boundingBox())!;
    await accordionHeader.click({
      position: { x: accordionBox.width - 8, y: accordionBox.height / 2 },
    });
    await expect(accordion).toHaveAttribute("data-block-selected", "true");
    await expect(accordion.getByRole("button", { name: "Collapse accordion" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const statusBlock = page.locator('[data-block-type="dynamic.status"]');
    const statusRegion = statusBlock.locator(".dynamic-status");
    const statusBox = (await statusRegion.boundingBox())!;
    await statusRegion.click({ position: { x: statusBox.width - 8, y: statusBox.height / 2 } });
    await expect(statusBlock).toHaveAttribute("data-block-selected", "true");
    const status = page.getByRole("checkbox", { name: "Dynamic status" });
    await status.check();
    await expect(page.locator('[data-block-type="dynamic.status"]')).toContainText("Done");
    const note = page.getByRole("textbox", { name: "Dynamic note" });
    await note.fill("Changed note");
    await note.press("Home");
    await note.press("Shift+End");
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toBe("Changed note");
  });

  test(`drops into and toggles the dynamic accordion in ${mode}`, async ({ page }) => {
    await openFixture(page, mode);
    const accordion = page.locator('[data-block-type="dynamic.accordion"]');
    const source = page
      .locator('[data-block-type="paragraph"]')
      .filter({ hasText: "Move into accordion" });
    const sourceId = (await source.getAttribute("data-block-id"))!;
    const accordionId = (await accordion.getAttribute("data-block-id"))!;
    const row = source.locator(":scope > .rivto-block-row");
    await row.hover();
    const handle = row.locator(".block-handle");
    await handle.hover();
    const from = (await handle.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
    const target = (await accordion.locator(".dynamic-accordion-children").boundingBox())!;
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
    await page.mouse.up();
    await expect.poll(() => parentId(page, sourceId)).toBe(accordionId);
    await applyHistory(page, "undo");
    await expect.poll(() => parentId(page, sourceId)).toBeNull();
    await applyHistory(page, "redo");
    await expect.poll(() => parentId(page, sourceId)).toBe(accordionId);
    await accordion.getByRole("button", { name: "Collapse accordion" }).click();
    await expect(source).toHaveCount(0);
    await accordion.getByRole("button", { name: "Expand accordion" }).click();
    await expect(accordion.locator('[data-block-type="paragraph"]')).toContainText(
      "Move into accordion",
    );
  });
}

test("loads independently built extension files over HTTP", async ({ page }) => {
  const loaded = new Set<string>();
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/dynamic-extensions/") && response.ok()) {
      loaded.add(path);
    }
  });
  await page.goto("/?test_features=1");
  await expect(page.locator('[data-journal-document="today"] > .page-surface')).toBeVisible();
  expect([...loaded].sort()).toEqual([
    "/dynamic-extensions/accordion.js",
    "/dynamic-extensions/counter.js",
    "/dynamic-extensions/element.js",
    "/dynamic-extensions/note.js",
    "/dynamic-extensions/status.js",
    "/dynamic-extensions/styles.css",
  ]);
});

test("uses the runtime extension list without rebuilding the application", async ({ page }) => {
  await page.route("**/dynamic-extensions.json", (route) =>
    route.fulfill({ json: ["/dynamic-extensions/counter.js"] }),
  );
  await page.goto("/?test_features=1");
  await expect(page.locator('[data-journal-document="today"] > .page-surface')).toBeVisible();
  const definitions = await page.evaluate(() => {
    const { reactEditor } = (
      window as unknown as {
        __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditor };
      }
    ).__rivtoDemo;
    return ["dynamic.counter", "dynamic.accordion"].map((type) =>
      Boolean(reactEditor.blockTypes.getDefinition(type)),
    );
  });
  expect(definitions).toEqual([true, false]);
});

test("shows an error when the extension list cannot be loaded", async ({ page }) => {
  await page.route("**/dynamic-extensions.json", (route) => route.fulfill({ status: 503 }));
  await page.goto("/?test_features=1");
  await expect(page.locator("#root")).toHaveText(
    "Could not load the demo extensions. Check the browser console.",
  );
});

test("creates and selects a dynamically loaded canvas element", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/?test_features=1");
  await page.locator('[data-editor-mode="edgeless"]').click();
  await page.getByRole("button", { name: "Dynamic element", exact: true }).click();
  const canvas = page.locator(".edgeless-viewport");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 260, box.y + 220);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 320, { steps: 8 });
  await page.mouse.up();
  const element = page.locator(
    '[data-edgeless-object-id][data-edgeless-visual-kind="dynamic.element"]',
  );
  await expect(element.locator("[data-dynamic-element]")).toContainText("Dynamic element");
  await expect(page.getByRole("toolbar", { name: "Selected objects" })).toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const button = element.getByRole("button", { name: "Element count: 0" });
  const before = await element.boundingBox();
  await button.click();
  await expect(element.getByRole("button", { name: "Element count: 1" })).toBeVisible();
  const after = await element.boundingBox();
  expect(after).toEqual(before);
  await expect(page.getByRole("toolbar", { name: "Selected objects" })).toBeVisible();
});

test("selection-enabled control follows the configured selection modifier", async ({ page }) => {
  await openFixture(page, "block");
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    host.__rivtoDemo.reactEditor.keyboard.setKeymapOverride("selection.block-modifier-down", [
      "Alt",
    ]);
  });
  const counter = page.locator('[data-block-type="dynamic.counter"]');
  const button = counter.getByRole("button", { name: /^Dynamic count:/ });
  await button.click({ modifiers: ["Alt"] });
  await expect(counter).toHaveAttribute("data-block-selected", "true");
  await expect(button).toHaveText("Dynamic count: 0");
});

test("range selection from a control does not activate its action", async ({ page }) => {
  await openFixture(page, "block");
  const status = page.locator('[data-block-type="dynamic.status"]');
  const region = status.locator(".dynamic-status");
  const box = (await region.boundingBox())!;
  await region.click({ position: { x: box.width - 8, y: box.height / 2 } });
  const counter = page.locator('[data-block-type="dynamic.counter"]');
  const button = counter.getByRole("button", { name: /^Dynamic count:/ });
  await button.click({ modifiers: ["Shift"] });
  await expect(counter).toHaveAttribute("data-block-selected", "true");
  await expect(status).toHaveAttribute("data-block-selected", "true");
  await expect(button).toHaveText("Dynamic count: 0");
});

test("control activation follows disabled selection modifiers", async ({ page }) => {
  await openFixture(page, "block");
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
    };
    host.__rivtoDemo.reactEditor.keyboard.setKeymapOverride("selection.block-modifier-down", []);
  });
  const counter = page.locator('[data-block-type="dynamic.counter"]');
  const button = counter.getByRole("button", { name: /^Dynamic count:/ });
  await button.click({ modifiers: ["Control"] });
  await expect(button).toHaveText("Dynamic count: 1");
});
