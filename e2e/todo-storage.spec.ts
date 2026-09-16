/**
 * Covers TODO-storage creation, local search/filter presentation, direct-child
 * boundaries, persisted status ordering, and both built-in surfaces through
 * the public demo integration.
 *
 * @module
 */
import { expect, test } from "@playwright/test";

const DROP_INDICATOR_CLASS = "page-drop-indicator";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("keeps the storage surface inside its selection and aligns root controls", async ({ page }) => {
  const storage = page.locator('[data-journal-document="today"] [data-block-type="todo-storage"]');
  const storageId = await storage.getAttribute("data-block-id");
  if (!storageId) throw new Error("Expected seeded TODO storage ID");
  await page.evaluate((id) => {
    const { editor } = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
    }).__rivtoDemo.editor;
    editor.selection.set({
      type: "selection",
      blocks: [{ id, start: 0, end: -1 }],
      anchorBlockId: id,
      focusBlockId: id,
    });
  }, storageId);

  await expect(storage).toHaveAttribute("data-block-selected", "true");
  const wrapper = storage.locator("xpath=parent::*");
  expect(await wrapper.boundingBox()).toEqual(await storage.boundingBox());
  const todoChildren = storage.locator(":scope > .page-block-children");
  const columnChildren = page.locator(
    '[data-block-type="columns-column"] > .page-block-children',
  ).first();
  expect(await todoChildren.evaluate((element) => getComputedStyle(element).paddingLeft))
    .toBe(await columnChildren.evaluate((element) => getComputedStyle(element).paddingLeft));

  const referenceRow = page.locator(
    '[data-block-type="paragraph"] > .page-block-row:has([data-collapse-toggle])',
  ).first();
  const [referenceHandle, referenceToggle, storageHandle, storageToggle] = await Promise.all([
    referenceRow.locator(".page-drag-handle").boundingBox(),
    referenceRow.locator("[data-collapse-toggle]").boundingBox(),
    storage.locator(":scope > .page-block-row .page-drag-handle").boundingBox(),
    storage.locator(":scope > .page-block-row [data-collapse-toggle]").boundingBox(),
  ]);
  if (!referenceHandle || !referenceToggle || !storageHandle || !storageToggle) {
    throw new Error("Expected root control geometry");
  }
  expect(storageHandle.x).toBeCloseTo(referenceHandle.x, 0);
  expect(storageToggle.x).toBeCloseTo(referenceToggle.x, 0);
});

test("searches and filters only direct TODO children without persisting UI state", async ({ page }) => {
  const document = page.locator('[data-journal-document="today"]');
  const storage = document.locator('[data-block-type="todo-storage"]');
  const todos = storage.locator('[data-block-type="todo-item"]');
  await expect(storage).toHaveCount(1);
  await expect(todos).toHaveCount(3);

  const search = storage.getByRole("searchbox", { name: "Search TODOs" });
  await search.fill("acceptance criteria");
  await expect(todos).toHaveCount(1);
  await expect(todos.getByRole("textbox", { name: "TODO item name" })).toHaveText("Review the project brief");

  await search.fill("extension");
  await storage.getByText("Filter", { exact: true }).click();
  await storage.getByLabel("Doing", { exact: true }).check();
  await storage.getByLabel("P1", { exact: true }).check();
  await storage.getByLabel("Rivto", { exact: true }).check();
  await expect(todos).toHaveCount(1);
  await storage.getByLabel("Planning", { exact: true }).check();
  await expect(todos).toHaveCount(1);
  await page.evaluate(() => {
    const blocks = (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: {
        getRootIds(): string[];
        getBlock(id: string): { id: string; type: string; content: string; children: Array<{ id: string; content: string }> };
        updateBlock(id: string, patch: { props: Record<string, unknown> }): void;
      } } } };
    }).__rivtoDemo.editor.editor.blocks;
    const storageBlock = blocks.getRootIds().map((id) => blocks.getBlock(id)).find(({ type }) => type === "todo-storage")!;
    const planning = storageBlock.children.find(({ content }) => content === "Review the project brief")!;
    blocks.updateBlock(planning.id, { props: { project: "Archive" } });
  });
  await expect(storage.getByLabel("Planning", { exact: true })).toHaveCount(0);
  await storage.getByLabel("Rivto", { exact: true }).uncheck();
  await expect(todos).toHaveCount(1);
  await storage.getByLabel("Doing", { exact: true }).uncheck();
  await storage.getByLabel("Todo", { exact: true }).check();
  await expect(todos).toHaveCount(0);
  await storage.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("extension");
  await expect(todos).toHaveCount(1);

  const storageId = await storage.getAttribute("data-block-id");
  if (!storageId) throw new Error("Expected seeded TODO storage ID");
  const injected = await page.evaluate((parentId) => {
    const runtime = (window as unknown as {
      __rivtoDemo: { editor: { editor: {
        blocks: {
          getBlock(id: string): { children: Array<{ id: string }> };
          insertBlock(input: Record<string, unknown>, afterId?: string): string;
          indentBlock(id: string): void;
        };
      } } };
    }).__rivtoDemo.editor.editor;
    const last = runtime.blocks.getBlock(parentId).children.at(-1)?.id;
    const noteId = runtime.blocks.insertBlock({ type: "paragraph", content: "Always visible note" }, last);
    const nestedId = runtime.blocks.insertBlock({
      type: "todo-item",
      content: "Nested unrelated task",
      props: { status: "done", description: "", priority: 4, project: "" },
    }, noteId);
    runtime.blocks.indentBlock(nestedId);
    return { noteId, nestedId };
  }, storageId);
  await expect(storage.locator(`[data-block-id="${injected.noteId}"]`)).toBeVisible();
  await expect(storage.locator(`[data-block-id="${injected.nestedId}"]`)).toBeVisible();

  const persisted = await page.evaluate((parentId) => (
    (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): { props: Record<string, unknown> } } } } };
    }).__rivtoDemo.editor.editor.blocks.getBlock(parentId).props
  ), storageId);
  expect(persisted).toEqual({ orderMode: "status", statusOrder: ["todo", "doing", "done"] });

  await page.locator('[data-editor-mode="edgeless"]').click();
  await expect(page.locator('[data-block-type="todo-storage"]')).toBeVisible();
  await page.locator('[data-editor-mode="block"]').click();
  await expect(document.getByRole("searchbox", { name: "Search TODOs" })).toHaveValue("");
});

test("persists keyboard status order and leaves manual child order untouched", async ({ page }) => {
  const document = page.locator('[data-journal-document="today"]');
  const storage = document.locator('[data-block-type="todo-storage"]');
  const storageId = await storage.getAttribute("data-block-id");
  if (!storageId) throw new Error("Expected seeded TODO storage ID");
  await storage.getByText("Order", { exact: true }).click();
  const statusOrdering = storage.getByLabel("Status", { exact: true });
  await expect(statusOrdering).toBeChecked();
  const doneOrder = storage.getByRole("listitem", { name: /Done status order/ });
  const doingOrder = storage.getByRole("listitem", { name: /Doing status order/ });
  const doingBefore = await doingOrder.boundingBox();
  if (!doingBefore) throw new Error("Expected sortable status geometry");
  await doneOrder.focus();
  await page.keyboard.press("Space");
  await expect(doneOrder).toHaveAttribute("data-dragging", "true");
  await page.keyboard.press("ArrowUp");
  // Optimistic sorting moves the displaced row down before the drop commits.
  await expect.poll(async () => (await doingOrder.boundingBox())?.y ?? 0).toBeGreaterThan(doingBefore.y);
  await page.keyboard.press("Space");

  await expect.poll(() => page.evaluate((parentId) => {
    const block = (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): {
        props: { statusOrder: string[] };
        children: Array<{ props: { status?: string } }>;
      } } } } };
    }).__rivtoDemo.editor.editor.blocks.getBlock(parentId);
    return { saved: block.props.statusOrder, children: block.children.map((child) => child.props.status) };
  }, storageId)).toEqual({ saved: ["todo", "done", "doing"], children: ["todo", "done", "doing"] });

  await storage.getByRole("button", { name: /Status: todo/ }).click();
  await expect.poll(() => page.evaluate((parentId) => (
    (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): { children: Array<{ content: string }> } } } } };
    }).__rivtoDemo.editor.editor.blocks.getBlock(parentId).children.map((child) => child.content)
  ), storageId)).toEqual(["Set up the workspace", "Review the project brief", "Build the editor extension"]);

  await storage.getByText("Order", { exact: true }).click();
  await statusOrdering.uncheck();
  const manualOrder = await page.evaluate((parentId) => {
    const blocks = (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: {
        getBlock(id: string): { children: Array<{ id: string; props: { status: string } }> };
        moveBlock(id: string, targetId: string | null): void;
      } } } };
    }).__rivtoDemo.editor.editor.blocks;
    const children = blocks.getBlock(parentId).children;
    blocks.moveBlock(children.at(-1)!.id, null);
    return blocks.getBlock(parentId).children.map((child) => child.id);
  }, storageId);
  await expect.poll(() => page.evaluate((parentId) => (
    (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): { children: Array<{ id: string }> } } } } };
    }).__rivtoDemo.editor.editor.blocks.getBlock(parentId).children.map((child) => child.id)
  ), storageId)).toEqual(manualOrder);
});

test("animates and persists sortable status drag and drop", async ({ page }) => {
  const storage = page.locator('[data-journal-document="today"] [data-block-type="todo-storage"]');
  const storageId = await storage.getAttribute("data-block-id");
  if (!storageId) throw new Error("Expected seeded TODO storage ID");
  await storage.getByText("Order", { exact: true }).click();
  const source = storage.getByRole("listitem", { name: /Doing status order/ });
  const target = storage.getByRole("listitem", { name: /Todo status order/ });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Expected sortable status geometry");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await expect(source).toHaveAttribute("data-dragging", "true");
  // Optimistic sorting moves the displaced row down before the drop commits.
  await expect.poll(async () => (await target.boundingBox())?.y ?? 0).toBeGreaterThan(targetBox.y);
  await page.mouse.up();
  await expect(storage).not.toHaveAttribute("data-block-selected", "true");
  await expect.poll(() => page.evaluate((parentId) => {
    const block = (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): {
        props: { statusOrder: string[] };
        children: Array<{ props: { status: string } }>;
      } } } } };
    }).__rivtoDemo.editor.editor.blocks.getBlock(parentId);
    return { saved: block.props.statusOrder, children: block.children.map((child) => child.props.status) };
  }, storageId)).toEqual({ saved: ["doing", "todo", "done"], children: ["doing", "todo", "done"] });
});

test("closes Filter and Order menus only when clicking outside them", async ({ page }) => {
  const storage = page.locator('[data-journal-document="today"] [data-block-type="todo-storage"]');
  const filterMenu = storage.locator("details", { hasText: "Filter" });
  const orderMenu = storage.locator("details", { hasText: "Order" });

  await storage.getByText("Filter", { exact: true }).click();
  await expect(filterMenu).toHaveAttribute("open", "");
  await storage.getByLabel("Todo", { exact: true }).check();
  await expect(filterMenu).toHaveAttribute("open", "");
  await storage.getByText("Order", { exact: true }).click();
  await expect(filterMenu).not.toHaveAttribute("open", "");
  await expect(orderMenu).toHaveAttribute("open", "");
  await storage.getByRole("searchbox", { name: "Search TODOs" }).click();
  await expect(orderMenu).not.toHaveAttribute("open", "");
});

test("reorders visible tasks while a filter is active in Manual mode", async ({ page }) => {
  const storage = page.locator('[data-journal-document="today"] [data-block-type="todo-storage"]');
  const storageId = await storage.getAttribute("data-block-id");
  if (!storageId) throw new Error("Expected seeded TODO storage ID");
  await storage.getByText("Order", { exact: true }).click();
  await storage.getByLabel("Status", { exact: true }).uncheck();
  await storage.getByText("Filter", { exact: true }).click();
  await storage.getByLabel("Rivto", { exact: true }).check();
  await storage.getByText("Filter", { exact: true }).click();

  const source = storage.locator('[data-block-type="todo-item"]').filter({ hasText: "Set up the workspace" });
  const target = storage.locator('[data-block-type="todo-item"]').filter({ hasText: "Build the editor extension" });
  const sourceRow = source.locator(":scope > .page-block-row");
  const handle = source.locator(".page-drag-handle");
  await sourceRow.hover();
  await handle.hover();
  const handleBox = await handle.boundingBox();
  const targetBox = await target.locator(":scope > .page-block-row").boundingBox();
  if (!handleBox || !targetBox) throw new Error("Expected filtered TODO drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 8, handleBox.y + 8, { steps: 3 });
  await page.mouse.move(targetBox.x + 2, targetBox.y + 1, { steps: 12 });
  await expect(source).toHaveAttribute("data-dragging", "true");
  await expect(storage.locator(`.${DROP_INDICATOR_CLASS}`)).toBeVisible();
  await page.mouse.up();

  await expect.poll(() => page.evaluate((parentId) => (
    (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): { children: Array<{ content: string }> } } } } };
    }).__rivtoDemo.editor.editor.blocks.getBlock(parentId).children.map((child) => child.content)
  ), storageId)).toEqual(["Review the project brief", "Set up the workspace", "Build the editor extension"]);
  await expect(storage.locator('[data-block-type="todo-item"] [aria-label="TODO item name"]')).toHaveText([
    "Set up the workspace",
    "Build the editor extension",
  ]);
});

test("creates a TODO storage from the slash menu", async ({ page }) => {
  const document = page.locator('[data-journal-document="today"]');
  await document.getByRole("button", { name: "Add block" }).click();
  const content = document.locator("[data-block-content]:focus");
  const created = content.locator('xpath=ancestor::*[@data-block-id][1]');
  const id = await created.getAttribute("data-block-id");
  if (!id) throw new Error("Expected new leaf block ID");
  await page.keyboard.type("/todos");
  await page.locator('[data-slash-command="type.todo-storage"]').click();
  const emptyStorage = document.locator(`[data-block-id="${id}"]`);
  const dropField = emptyStorage.getByLabel("Drop blocks into TODO storage");
  await expect(emptyStorage).toHaveAttribute("data-block-type", "todo-storage");
  await expect(dropField).toContainText("Drag a task here");

  await document.getByRole("button", { name: "Add block" }).click();
  const source = document.locator("[data-block-content]:focus").locator('xpath=ancestor::*[@data-block-id][1]');
  const sourceId = await source.getAttribute("data-block-id");
  const handleBox = await source.locator(".page-drag-handle").boundingBox();
  const dropBox = await dropField.boundingBox();
  if (!sourceId || !handleBox || !dropBox) throw new Error("Expected source and empty-storage drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 12 });
  await expect(emptyStorage).toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();
  await expect(emptyStorage.locator(`[data-block-id="${sourceId}"]`)).toBeVisible();
  await expect(dropField).toHaveCount(0);
});

test("starts writing in an empty TODO storage from the keyboard", async ({ page }) => {
  const storageId = await page.evaluate(() => {
    const { editor } = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
    }).__rivtoDemo.editor;
    return editor.blocks.insertBlock({ type: "todo-storage", content: "" });
  });
  const storage = page.locator(`[data-block-id="${storageId}"]`);
  const dropField = storage.getByRole("button", { name: "Drop blocks into TODO storage" });
  const storageBox = await storage.boundingBox();
  const dropBox = await dropField.boundingBox();
  if (!storageBox || !dropBox) throw new Error("Expected empty-storage geometry");
  expect(dropBox.x).toBeGreaterThanOrEqual(storageBox.x);
  expect(dropBox.x + dropBox.width).toBeLessThanOrEqual(storageBox.x + storageBox.width);
  expect(dropBox.y + dropBox.height).toBeLessThanOrEqual(storageBox.y + storageBox.height);
  await dropField.press("Enter");
  await expect(storage.locator(':scope > .page-block-children > [data-block-type="paragraph"]')).toHaveCount(1);
  await expect(storage.locator("[data-block-content]")).toBeFocused();
});
