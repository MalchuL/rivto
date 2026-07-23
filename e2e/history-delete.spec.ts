import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  blockIdSelector,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  BLOCK_SELECTED_SELECTOR,
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

/** Resolves a stable block locator after undo recreates its rendered element. */
function blockById(page: Page, id: string): Locator {
  return page.locator(blockIdSelector(id));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Backspace and Delete remove root-focused block selections atomically", async ({ page }) => {
  const [firstId, secondId] = await selectRoots(page, [0, 1]);
  await expect(page.locator(BLOCK_SELECTED_SELECTOR)).toHaveCount(2);

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
