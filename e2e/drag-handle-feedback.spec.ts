import { expect, test } from "@playwright/test";

for (const { repeat, mode } of [
  { repeat: 1, mode: "block" },
  { repeat: 200, mode: "block" },
  { repeat: 1, mode: "edgeless" },
]) {
  for (const cancel of [false, true]) {
    test(`drag handle feedback mode=${mode}, repeat=${repeat}, cancel=${cancel}`, async ({
      page,
    }) => {
      await page.goto(`/?repeat=${repeat}`);
      await page.locator(`[data-editor-mode="${mode}"]`).first().click();
      const surface = page
        .locator('[data-journal-document="today"] [data-rivto-block-editor]')
        .first();
      await expect(surface).toBeVisible();
      const handles = surface.locator(".block-handle[data-draggable]");
      const source = handles.nth(0);
      const target = handles.nth(2);
      const from = (await source.boundingBox())!;
      const to = (await target.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await expect(source).toHaveCSS("opacity", "1");
      await expect(source).toHaveCSS("cursor", "grab");
      await page.mouse.down();
      const started = Date.now();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
      await expect(surface.locator(".rivto-block-drag-preview")).toBeVisible();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      console.log(`drag feedback repeat=${repeat}: ${Date.now() - started}ms input through paint`);
      await expect(target).toHaveCSS("cursor", "default");
      await expect(target).toHaveCSS("opacity", "0");
      await expect(target.locator(".block-handle-icon")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(surface.locator(".rivto-block-content").first()).toHaveCSS("cursor", "default");
      await expect(page.locator("body")).toHaveCSS("cursor", "default");
      if (cancel) {
        await page.keyboard.press("Escape");
      }
      await page.mouse.up();
      await expect(surface.locator(".rivto-block-drag-preview")).toHaveCount(0);
      await target.hover({ force: true });
      await expect(target).toHaveCSS("cursor", "grab");
      await expect(target).toHaveCSS("opacity", "1");
      await expect(target.locator(".block-handle-icon")).not.toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
    });
  }
}
