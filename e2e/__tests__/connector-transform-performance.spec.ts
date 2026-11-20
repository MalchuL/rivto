import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`attached connector follows a shape transform, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const ids = await createFixture(page);
    const shape = page.locator(`[data-edgeless-object-id="${ids.shape}"]`);
    const before = (await shape.boundingBox())!;
    const x = before.x + before.width / 2;
    const y = before.y + before.height / 2;
    await page.keyboard.down("Alt");
    await page.mouse.move(x, y);
    const start = await measureStart(page);
    await page.mouse.move(x + 10, y + 5);
    const stroke = page.locator("[data-edgeless-connector-preview-stroke]");
    await expect(stroke).toHaveCount(1);
    await expect(stroke).toHaveAttribute(
      "marker-end",
      `url(#connector-preview-end-${ids.connector})`,
    );
    const path = await stroke.getAttribute("d");
    const samples = [];
    for (const offset of [20, 30, 40]) {
      samples.push(await measureMove(page, x + offset, y + offset / 2));
    }
    expect(await stroke.getAttribute("d")).not.toBe(path);
    await expect(page.locator("[data-edgeless-connector-preview-label]")).toHaveText(
      "Attached link",
    );
    console.log(JSON.stringify({ interaction: "connector-transform", repeat, start, samples }));
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect(stroke).toHaveCount(0);
    expect((await shape.boundingBox())!.x - before.x).toBeGreaterThan(30);
    const frame = await page.evaluate(
      (id) =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.elements.getElementNode(id)!.frame,
      ids.shape,
    );
    expect(frame.x).toBeGreaterThan(130);
  });
}

/**
 * Inserts a shape and a labeled connector attached to its right edge.
 *
 * @param page - Demo with an active edgeless editor.
 * @returns IDs for the shape and connector.
 */
async function createFixture(page: Page) {
  return page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const shape = editor.elements.insertElement({
      type: "rectangle",
      frame: { x: 100, y: 200, width: 160, height: 100 },
      zIndex: 10000,
    }).id;
    const connector = editor.elements.insertElement({
      type: "connector",
      frame: { x: 260, y: 250, width: 200, height: 1 },
      props: {
        text: "Attached link",
        endStyle: "arrow",
        source: { elementId: shape, anchor: { x: 1, y: 0.5 }, position: { x: 260, y: 250 } },
        target: { anchor: { x: 0.5, y: 0.5 }, position: { x: 460, y: 250 } },
      },
      zIndex: 10001,
    }).id;
    return { shape, connector };
  });
}

/**
 * Measures mouse admission and the following two render frames.
 *
 * @param page - Warm demo with the pointer over the draggable shape.
 * @returns Synchronous mouse-start and two-frame durations in milliseconds.
 */
async function measureStart(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as { startTiming: null | { sync: number; frames: number } };
    state.startTiming = null;
    let start = 0;
    window.addEventListener(
      "mousedown",
      () => {
        start = performance.now();
      },
      { capture: true, once: true },
    );
    window.addEventListener(
      "mousedown",
      () => {
        const sync = performance.now() - start;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.startTiming = { sync, frames: performance.now() - start };
          }),
        );
      },
      { once: true },
    );
  });
  await page.mouse.down();
  await page.waitForFunction(
    () => (window as unknown as { startTiming: unknown }).startTiming !== null,
  );
  return page.evaluate(
    () => (window as unknown as { startTiming: { sync: number; frames: number } }).startTiming,
  );
}

/**
 * Measures a captured transform move and the next two rendering frames.
 *
 * @param page - Warm demo with a shape gesture in progress.
 * @param x - Horizontal client coordinate in CSS pixels.
 * @param y - Vertical client coordinate in CSS pixels.
 * @returns Synchronous event and two-frame durations in milliseconds.
 */
async function measureMove(page: Page, x: number, y: number) {
  await page.evaluate(() => {
    const state = window as unknown as { transformTiming: null | { sync: number; frames: number } };
    state.transformTiming = null;
    let start = 0;
    window.addEventListener(
      "mousemove",
      () => {
        start = performance.now();
      },
      { capture: true, once: true },
    );
    window.addEventListener(
      "mousemove",
      () => {
        const sync = performance.now() - start;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.transformTiming = { sync, frames: performance.now() - start };
          }),
        );
      },
      { once: true },
    );
  });
  await page.mouse.move(x, y);
  await page.waitForFunction(
    () => (window as unknown as { transformTiming: unknown }).transformTiming !== null,
  );
  return page.evaluate(
    () =>
      (window as unknown as { transformTiming: { sync: number; frames: number } }).transformTiming,
  );
}
