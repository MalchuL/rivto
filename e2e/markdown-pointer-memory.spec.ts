import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Tracks native gesture listeners added after the code editor is mounted. */
interface PointerMemoryWindow extends Window {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI };
  readonly gestureListeners: Map<string, Set<EventListenerOrEventListenerObject>>;
}

/**
 * Records native gesture listeners registered on the current window.
 *
 * @returns The window records subsequent listener additions and removals.
 */
function observeGestureListeners(): void {
  const host = window as unknown as PointerMemoryWindow;
  const tracked = new Set(["pointermove", "pointerup", "pointercancel"]);
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  Object.assign(host, { gestureListeners: listeners });
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (tracked.has(type) && listener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(listener);
    }
    add(type, listener, options);
  };
  window.removeEventListener = (type, listener, options) => {
    if (listener) {
      listeners.get(type)?.delete(listener);
    }
    remove(type, listener, options);
  };
}

/**
 * Counts the currently registered tracked gesture listeners.
 *
 * @returns Total listeners added since observation began and not yet removed.
 */
function countGestureListeners(): number {
  return [...(window as unknown as PointerMemoryWindow).gestureListeners.values()].reduce(
    (count, listeners) => count + listeners.size,
    0,
  );
}

/**
 * Drags horizontally across the editable code at the supplied viewport position.
 *
 * @param page - Browser page receiving pointer input.
 * @param x - Horizontal starting coordinate in viewport pixels.
 * @param y - Vertical coordinate in viewport pixels.
 * @returns The pointer has completed a 60-pixel selection gesture.
 */
async function dragCodeSelection(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y);
  await page.mouse.up();
}

/**
 * Opens a Markdown code editor in the requested surface and prepares its geometry.
 *
 * @param page - Browser page hosting the demo.
 * @param mode - Surface used to display the document.
 * @returns A promise resolving to the editable code element.
 */
async function openCodeEditor(page: Page, mode: "Page" | "Edgeless"): Promise<Locator> {
  await page.goto("/?test_features=1");
  if (mode === "Edgeless") {
    await page.getByRole("button", { name: mode, exact: true }).first().click();
  }
  const id = await page.evaluate(() => {
    const host = window as unknown as PointerMemoryWindow;
    const blocks = host.__rivtoDemo.editor.blocks;
    const blockId = blocks.getRootIds()[0]!;
    blocks.updateBlock(blockId, {
      content: "```text\nselect this code and continue selecting this longer line\n```",
    });
    return blockId;
  });
  const code = page.locator(`[data-block-id="${id}"] .markdown-code-editor`).first();
  // The demo's inline-code line-height rule also matches the nested preview code.
  await code.evaluate((element) => {
    (element as HTMLElement).style.lineHeight = "normal";
    (element.previousElementSibling as HTMLElement).style.lineHeight = "normal";
  });
  await code.scrollIntoViewIfNeeded();
  await expect(code).toBeVisible();
  return code;
}

for (const mode of ["Page", "Edgeless"] as const) {
  test(`releases code selection listeners when the window blurs in ${mode}`, async ({ page }) => {
    const code = await openCodeEditor(page, mode);
    await page.evaluate(observeGestureListeners);
    const offset = mode === "Edgeless" ? 150 : 10;
    await expect
      .poll(() =>
        code.evaluate((element, x) => {
          const rect = element.getBoundingClientRect();
          return document.elementFromPoint(rect.x + x, rect.y + rect.height / 2) === element;
        }, offset),
      )
      .toBe(true);
    const box = await code.boundingBox();
    if (!box) {
      throw new Error("Expected editable code geometry");
    }
    await page.mouse.move(box.x + offset, box.y + box.height / 2);
    await page.mouse.down();
    expect(await page.evaluate(countGestureListeners)).toBe(3);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    expect(await page.evaluate(countGestureListeners)).toBe(0);
    await page.mouse.up();
    await expect(code).toBeFocused();
  });
  test(`selects code after a cancelled gesture in ${mode}`, async ({ page, browserName }) => {
    test.fixme(
      mode === "Edgeless" && browserName === "firefox",
      "Firefox Edgeless selection is empty after a blur on the unmodified branch.",
    );
    const code = await openCodeEditor(page, mode);
    await page.evaluate(observeGestureListeners);
    const offset = mode === "Edgeless" ? 150 : 10;
    const box = await code.boundingBox();
    if (!box) {
      throw new Error("Expected editable code geometry");
    }
    await page.mouse.move(box.x + offset, box.y + box.height / 2);
    await page.mouse.down();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    await expect(code).toBeFocused();
    await dragCodeSelection(page, box.x + offset, box.y + box.height / 2);
    await expect
      .poll(() => page.evaluate(() => getSelection()?.toString().length ?? 0))
      .toBeGreaterThan(0);
    expect(await page.evaluate(countGestureListeners)).toBe(0);
    await expect(code).toBeFocused();
  });
}
