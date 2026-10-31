import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`hover grid stays behind cards, repeat=${repeat}`, async ({ page }) => {
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    const journal = page.locator('[data-journal-document="today"]');
    await journal.locator('[data-editor-mode="edgeless"]').click();
    const canvas = journal.locator(".edgeless-viewport");
    const card = canvas.locator("[data-edgeless-root]").first();
    await card.hover({ position: { x: 100, y: 60 } });
    const spotlight = canvas.locator(".edgeless-grid-spotlight");
    await expect(spotlight).toHaveCSS("opacity", "1");
    const bounds = (await card.boundingBox())!;
    const clip = { x: bounds.x + 20, y: bounds.y + 20, width: 160, height: 80 };
    const withSpotlight = await page.screenshot({ clip, caret: "hide", animations: "disabled" });
    await spotlight.evaluate((element) => {
      element.style.visibility = "hidden";
    });
    const withoutSpotlight = await page.screenshot({ clip, caret: "hide", animations: "disabled" });
    expect(withoutSpotlight.equals(withSpotlight)).toBe(true);
    const viewportBounds = (await canvas.boundingBox())!;
    await canvas.hover({ position: { x: viewportBounds.width - 70, y: 240 } });
    const backgroundClip = {
      x: viewportBounds.x + viewportBounds.width - 110,
      y: viewportBounds.y + 200,
      width: 80,
      height: 80,
    };
    const background = await page.screenshot({ clip: backgroundClip });
    await spotlight.evaluate((element) => {
      element.style.visibility = "visible";
    });
    expect((await page.screenshot({ clip: backgroundClip })).equals(background)).toBe(false);
  });

  test(`wheel and middle-button pan keep both dot layers aligned, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    const journal = page.locator('[data-journal-document="today"]');
    await journal.locator('[data-editor-mode="edgeless"]').click();
    const canvas = journal.locator(".edgeless-viewport");
    await canvas.hover({ position: { x: 150, y: 150 } });
    await page.mouse.wheel(13, 37);
    await expect(canvas).toHaveAttribute("data-edgeless-pan-y", "-37");
    await expect(canvas).toHaveCSS("background-position", "-13px -37px");
    await expect(canvas.locator(".edgeless-grid-spotlight")).toHaveCSS(
      "background-position",
      "-13px -37px",
    );
    await expect(canvas.locator(".edgeless-plane")).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, -13, -37)",
    );
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + 150, bounds.y + 150);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(bounds.x + 157, bounds.y + 159);
    await page.mouse.up({ button: "middle" });
    await expect(canvas).toHaveAttribute("data-edgeless-pan-y", "-28");
    await expect(canvas).toHaveCSS("background-position", "-6px -28px");
    await expect(canvas.locator(".edgeless-grid-spotlight")).toHaveCSS(
      "background-position",
      "-6px -28px",
    );
  });
}
