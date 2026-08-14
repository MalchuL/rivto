import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  blockIdSelector,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "./dom-markers";

/** Selects root blocks through the same Ctrl+click gesture used by the demo. */
async function selectRoots(page: Page, indexes: number[]): Promise<string[]> {
  const roots = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`);
  const ids: string[] = [];
  for (const index of indexes) {
    const root = roots.nth(index);
    const id = await root.getAttribute(BLOCK_ID_ATTRIBUTE);
    if (!id) throw new Error("Expected root block ID");
    ids.push(id);
    await root.locator(":scope > .page-block-row [data-block-content]").click({ modifiers: ["Control"] });
  }
  return ids;
}

/** Inserts a separator followed by the focused empty writing block it creates. */
async function insertSeparatorContinuation(page: Page): Promise<{
  readonly separator: Locator;
  readonly writing: Locator;
  readonly content: Locator;
  readonly separatorId: string;
  readonly writingId: string;
}> {
  const sourceContent = page.locator(".page-surface > .page-block [data-block-content]").first();
  const source = sourceContent.locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  await sourceContent.click();
  await page.keyboard.press("Control+Shift+Enter");
  const separator = source.locator(`xpath=following-sibling::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const writing = separator.locator(`xpath=following-sibling::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const content = writing.locator(":scope > .page-block-row [data-block-content]");
  const separatorId = await separator.getAttribute(BLOCK_ID_ATTRIBUTE);
  const writingId = await writing.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!separatorId || !writingId) throw new Error("Expected inserted separator continuation IDs");
  await expect(content).toBeFocused();
  return { separator, writing, content, separatorId, writingId };
}

/** Resolves a stable block locator after undo recreates its rendered element. */
function blockById(page: Page, id: string): Locator {
  return page.locator(blockIdSelector(id));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Backspace and Delete remove root-focused block selections atomically", async ({ page }) => {
  const [firstId, secondId] = await selectRoots(page, [0, 1]);
  await expect(page.locator("[data-block-selected]")).toHaveCount(2);

  await page.keyboard.press("Backspace");
  await expect(blockById(page, firstId!)).toHaveCount(0);
  await expect(blockById(page, secondId!)).toHaveCount(0);

  // One undo restores both roots, proving deletion was one history item.
  await page.keyboard.press("Control+z");
  await expect(blockById(page, firstId!)).toBeVisible();
  await expect(blockById(page, secondId!)).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(blockById(page, firstId!)).toHaveCount(0);
  await expect(blockById(page, secondId!)).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await selectRoots(page, [0, 1]);
  await page.keyboard.press("Delete");
  await expect(blockById(page, firstId!)).toHaveCount(0);
  await expect(blockById(page, secondId!)).toHaveCount(0);
});

test("Backspace and Delete remove an empty writing block after a structural block", async ({ page }) => {
  const inserted = await insertSeparatorContinuation(page);

  await page.keyboard.press("Backspace");
  await expect(blockById(page, inserted.writingId)).toHaveCount(0);
  await expect(blockById(page, inserted.separatorId)).toHaveAttribute("data-block-selected", "true");

  await page.keyboard.press("Control+z");
  await expect(blockById(page, inserted.writingId)).toBeVisible();
  await blockById(page, inserted.writingId).locator("[data-block-content]").click();
  await page.keyboard.press("Delete");
  await expect(blockById(page, inserted.writingId)).toHaveCount(0);
  await expect(blockById(page, inserted.separatorId)).toHaveAttribute("data-block-selected", "true");
});

test("removing an empty parent promotes its first child and adopts later children", async ({ page }) => {
  const inserted = await insertSeparatorContinuation(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("First child");
  const firstContent = page.locator("[data-block-content]:focus");
  const first = firstContent.locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const firstId = await first.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!firstId) throw new Error("Expected first child ID");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second child");
  const secondContent = page.locator("[data-block-content]:focus");
  const second = secondContent.locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const secondId = await second.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!secondId) throw new Error("Expected second child ID");

  const collapse = inserted.writing.locator(":scope > .page-block-row [data-collapse-toggle]");
  await collapse.click();
  await inserted.content.click();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Delete");
  await expect(blockById(page, inserted.writingId)).toBeVisible();
  await collapse.click();
  await inserted.content.click();
  await page.keyboard.press("Backspace");

  await expect(blockById(page, inserted.writingId)).toHaveCount(0);
  await expect(blockById(page, firstId).locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}]`)).toHaveCount(0);
  await expect(blockById(page, secondId).locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`))
    .toHaveAttribute(BLOCK_ID_ATTRIBUTE, firstId);
  await expect(blockById(page, inserted.separatorId)).toHaveAttribute("data-block-selected", "true");

  await page.keyboard.press("Control+z");
  await expect(blockById(page, inserted.writingId)).toBeVisible();
  await expect(blockById(page, firstId).locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`))
    .toHaveAttribute(BLOCK_ID_ATTRIBUTE, inserted.writingId);
  await expect(blockById(page, secondId).locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`))
    .toHaveAttribute(BLOCK_ID_ATTRIBUTE, inserted.writingId);
});

test("undo works immediately after deleting blocks from a focused editable", async ({ page }) => {
  const [firstId, secondId] = await selectRoots(page, [0, 1]);
  const focusedContent = blockById(page, secondId!).locator("[data-block-content]");

  const focusAfterDelete = await focusedContent.evaluate(async (element) => {
    const requestFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 1;
    (element as HTMLElement).focus();
    element.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Delete",
    }));
    await new Promise((resolve) => setTimeout(resolve));
    const active = document.activeElement;
    active?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "z",
    }));
    window.requestAnimationFrame = requestFrame;
    return active?.getAttribute("data-block-content") !== null;
  });

  expect(focusAfterDelete).toBe(true);
  await expect(blockById(page, firstId!)).toBeVisible();
  await expect(blockById(page, secondId!)).toBeVisible();
});

test("history shortcuts replace native contenteditable history", async ({ page }) => {
  const content = page.locator("[data-block-content]").first();
  const initial = await content.textContent();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(content).toHaveText(`${initial}!`);

  await page.keyboard.press("Control+z");
  await expect(content).toHaveText(initial ?? "");
  await expect(content).toBeFocused();

  await page.keyboard.press("Control+Shift+z");
  await expect(content).toHaveText(`${initial}!`);
  await page.keyboard.press("Control+z");
  await expect(content).toHaveText(initial ?? "");
  await page.keyboard.press("Control+y");
  await expect(content).toHaveText(`${initial}!`);
});

test("history shortcuts work when the active layout reports Cyrillic keys", async ({ page }) => {
  const content = page.locator("[data-block-content]").first();
  const initial = await content.textContent();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");

  const press = (key: string, code: string, shiftKey = false) => content.evaluate(
    (element, init) => element.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      ...init,
    })),
    { key, code, shiftKey },
  );

  expect(await press("я", "KeyZ")).toBe(false);
  await expect(content).toHaveText(initial ?? "");
  expect(await press("Я", "KeyZ", true)).toBe(false);
  await expect(content).toHaveText(`${initial}!`);
  expect(await press("я", "KeyZ")).toBe(false);
  await expect(content).toHaveText(initial ?? "");
  expect(await press("н", "KeyY")).toBe(false);
  await expect(content).toHaveText(`${initial}!`);
});

test("beforeinput history commands are canceled and routed through CRDT history", async ({ page }) => {
  const content = page.locator("[data-block-content]").first();
  const initial = await content.textContent();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");

  const undoDispatched = await content.evaluate((element) => element.dispatchEvent(new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType: "historyUndo",
  })));
  expect(undoDispatched).toBe(false);
  await expect(content).toHaveText(initial ?? "");

  const redoDispatched = await content.evaluate((element) => element.dispatchEvent(new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType: "historyRedo",
  })));
  expect(redoDispatched).toBe(false);
  await expect(content).toHaveText(`${initial}!`);
});

test("unsupported modifiers and IME history requests do not change the document", async ({ page }) => {
  const content = page.locator("[data-block-content]").first();
  const initial = await content.textContent();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");

  await page.keyboard.press("Control+Alt+z");
  await expect(content).toHaveText(`${initial}!`);

  const dispatched = await content.evaluate((element) => element.dispatchEvent(new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType: "historyUndo",
    isComposing: true,
  })));
  expect(dispatched).toBe(false);
  await expect(content).toHaveText(`${initial}!`);
});

test("focused block controls do not delete an existing structural selection", async ({ page }) => {
  const [selectedId] = await selectRoots(page, [0]);
  const collapseToggle = page.locator("[data-collapse-toggle]").first();
  await collapseToggle.focus();
  await page.keyboard.press("Delete");
  await expect(blockById(page, selectedId!)).toBeVisible();

  const dragHandle = blockById(page, selectedId!).locator(":scope > .page-block-row .page-drag-handle");
  await dragHandle.focus();
  await page.keyboard.press("Backspace");
  await expect(blockById(page, selectedId!)).toBeVisible();
});
