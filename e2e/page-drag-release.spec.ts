import { blockDropRegion } from "./drop-regions";
import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Installs a native capturing handle whose release cleanup may precede window delivery.
 *
 * Browser retargeting survives releasePointerCapture during dispatch: the same
 * pointerup still targets the source, although hasPointerCapture is now false.
 *
 * @param page - Production Page demo receiving real mouse input.
 * @param earlyRelease - Whether a handle listener releases capture before the drag controller.
 * @returns Resolves when the isolated three-block hierarchy and native listeners are mounted.
 */
async function loadReleaseFixture(page: Page, earlyRelease: boolean): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 1200 });
  await page.goto("/");
  await page.locator(".page-surface").first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    for (const id of ["upper", "lower", "moving"]) {
      editor.blocks.insertBlock({ id, type: "paragraph", content: id });
    }
    editor.history.clear();
  });
  await page.locator('[data-block-id="moving"] .block-handle').evaluate((handle, earlyRelease) => {
    handle.addEventListener(
      "pointerdown",
      (event) => {
        handle.setPointerCapture((event as PointerEvent).pointerId);
      },
      { once: true },
    );
    handle.addEventListener(
      "pointerup",
      (event) => {
        if (earlyRelease) {
          handle.releasePointerCapture((event as PointerEvent).pointerId);
        }
      },
      { once: true },
    );
  }, earlyRelease);
}

/**
 * Reads persisted root order independently of the drop preview.
 *
 * @param page - Browser containing the test-owned document.
 * @returns Resolves with current root IDs in canonical order.
 */
async function rootOrder(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.blocks.getRootIds(),
  );
}

for (const earlyRelease of [false, true]) {
  test(`Page drop survives capture cleanup before window delivery=${earlyRelease}`, async ({
    page,
  }) => {
    await loadReleaseFixture(page, earlyRelease);
    await page.locator('[data-block-id="moving"] > .rivto-block-row').hover();
    const source = (await page.locator('[data-block-id="moving"] .block-handle').boundingBox())!;
    const target = (await (
      await blockDropRegion(page.locator('[data-block-id="upper"]'), "before")
    ).boundingBox())!;
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
    await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
    await page.mouse.up();
    await expect.poll(() => rootOrder(page)).toEqual(["moving", "upper", "lower"]);
    await expect(page.locator(".rivto-block-drag-preview")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => rootOrder(page)).toEqual(["upper", "lower", "moving"]);
  });
}
