import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Replaces the document with one positioned writing card.
 *
 * @param page - Demo containing the editor fixture.
 * @returns Resolves when the card is inserted and fixture history is cleared.
 */
async function prepareExistingCard(page: Page) {
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({ id: "existing", type: "paragraph", content: "Existing" });
    editor.elements.insertElement({
      type: "block",
      zIndex: 0,
      frame: { x: 300, y: 250, width: 400, height: 200 },
      props: { startBlockId: "existing", endBlockId: "existing" },
    });
    editor.history.clear();
  });
}

/**
 * Captures the next double-click's actual canvas position before creation moves the camera.
 *
 * @param viewport - Canvas receiving the double-click.
 * @returns Resolves after installing a one-shot listener that records world coordinates.
 */
async function captureRequestedPoint(viewport: Locator) {
  await viewport.evaluate((root) => {
    root.addEventListener(
      "dblclick",
      (event) => {
        const rect = root.getBoundingClientRect();
        const zoom = Number(root.dataset.edgelessZoom);
        (window as unknown as { requestedPoint: { x: number; y: number } }).requestedPoint = {
          x: (event.clientX - rect.left - Number(root.dataset.edgelessPanX)) / zoom,
          y: (event.clientY - rect.top - Number(root.dataset.edgelessPanY)) / zoom,
        };
      },
      { capture: true, once: true },
    );
  });
}

/**
 * Reads the first element created after the fixture snapshot.
 *
 * @param page - Demo containing the editor fixture.
 * @param previous - IDs already present before the gesture.
 * @returns A promise resolving to the new element's ID and position, or undefined when absent.
 */
async function createdCard(page: Page, previous: string[]) {
  return page.evaluate((ids) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const element = editor.elements.getElementNodes().find((entry) => !ids.includes(entry.id));
    return element ? { id: element.id, x: element.frame.x, y: element.frame.y } : undefined;
  }, previous);
}

for (const zoomed of [false, true]) {
  test(`double-click places a card at the requested point when its frame overlaps another, zoomed=${zoomed}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/?test_features=1");
    const today = page.locator('[data-journal-document="today"]');
    await today.locator(".page-surface").first().waitFor();
    await prepareExistingCard(page);
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    const viewport = today.locator(".edgeless-viewport");
    await viewport.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await expect(viewport.locator('[data-block-id="existing"]')).toBeVisible();
    if (zoomed) {
      await today.getByRole("button", { name: "Zoom in", exact: true }).click();
    }
    const point = await viewport.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const zoom = Number(element.dataset.edgelessZoom);
      return {
        x: rect.left + Number(element.dataset.edgelessPanX) + 340 * zoom,
        y: rect.top + Number(element.dataset.edgelessPanY) + 240 * zoom,
      };
    });
    const ids = await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.elements
        .getElementNodes()
        .map((element) => element.id),
    );
    await captureRequestedPoint(viewport);
    await page.mouse.dblclick(point.x, point.y);
    const requested = await page.evaluate(
      () => (window as unknown as { requestedPoint: { x: number; y: number } }).requestedPoint,
    );
    const created = () => createdCard(page, ids);
    await expect.poll(created).toMatchObject(requested);
    const element = (await created())!;
    await expect(
      viewport.locator(`[data-edgeless-root="${element.id}"] [data-block-content]`),
    ).toBeFocused();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(created).toBeUndefined();
    await viewport.focus();
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(created).toMatchObject(requested);
  });
}
