import { expect, test, type Locator } from "@playwright/test";

/**
 * Finds an unoccupied point close to a canvas edge.
 *
 * @param viewport - Visible canvas receiving the gesture.
 * @param edge - Edge along which to search for a point.
 * @returns Viewport coordinates outside cards, visuals and controls.
 * @throws If the requested edge has no available point.
 */
async function emptyCanvasEdgePoint(viewport: Locator, edge: "bottom" | "right") {
  return viewport.evaluate((element, edge) => {
    const rect = element.getBoundingClientRect();
    for (
      let offset = 20;
      offset < (edge === "bottom" ? rect.width : rect.height) - 20;
      offset += 10
    ) {
      const x = edge === "bottom" ? rect.right - offset : rect.right - 20;
      const y = edge === "bottom" ? rect.bottom - 15 : rect.top + offset;
      const hit = document.elementFromPoint(x, y);
      if (
        hit &&
        !hit.closest(
          "[data-edgeless-root], [data-edgeless-object-kind], [data-edgeless-ui], [data-editor-control]",
        )
      ) {
        return { x, y };
      }
    }
    throw new Error("No empty canvas point at the requested edge");
  }, edge);
}

for (const edge of ["bottom", "right"] as const) {
  test(`creating a card near the ${edge} keeps canvas controls fixed and the editor visible`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/?test_features=1");
    const today = page.locator('[data-journal-document="today"]');
    await today.locator(".page-surface").first().waitFor();
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    const viewport = today.locator(".edgeless-viewport");
    await viewport.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const point = await emptyCanvasEdgePoint(viewport, edge);
    const controls = viewport.locator(".edgeless-zoom-controls");
    const before = await controls.boundingBox();
    const scroll = await page.evaluate(() => [window.scrollX, window.scrollY]);
    const cards = viewport.locator("[data-edgeless-root]");
    const count = await cards.count();
    await page.mouse.dblclick(point.x, point.y);
    await expect(cards).toHaveCount(count + 1);
    const editor = cards.last().locator("[data-block-content]");
    await expect(editor).toBeFocused();
    await expect
      .poll(() => viewport.evaluate((element) => [element.scrollLeft, element.scrollTop]))
      .toEqual([0, 0]);
    await expect.poll(() => controls.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual(scroll);
    const bounds = (await viewport.boundingBox())!;
    const content = (await editor.boundingBox())!;
    expect(content.x).toBeLessThan(bounds.x + bounds.width);
    expect(content.x + content.width).toBeGreaterThan(bounds.x);
    expect(content.y).toBeLessThan(bounds.y + bounds.height);
    expect(content.y + content.height).toBeGreaterThan(bounds.y);
    await page.keyboard.type("New card");
    await expect(editor).toHaveText("New card");
  });
}
