import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { blockDropRegion } from "./drop-regions";

test("toggles persistent handles in page and edgeless", async ({ page }) => {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const setting = page.getByRole("checkbox", { name: "Always show drag handles" });
  for (const mode of ["Page", "Edgeless"]) {
    if (mode === "Edgeless") {
      await page.getByRole("button", { name: mode, exact: true }).click();
    }
    const handle = today.locator(".block-handle").first();
    await page.mouse.move(0, 0);
    await expect(handle).toHaveCSS("opacity", "0");
    await setting.check();
    await page.mouse.move(0, 0);
    await expect(handle).toHaveCSS("opacity", "1");
    await expect(handle).toHaveCSS("pointer-events", "auto");
    await setting.uncheck();
    await page.mouse.move(0, 0);
    await expect(handle).toHaveCSS("opacity", "0");
  }
});

test("a persistently visible handle still opens its block", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Always show drag handles" }).check();
  const today = page.locator('[data-journal-document="today"]');
  await today.locator(".block-handle").first().click();
  await expect(page.locator(".journal-stack")).toHaveAttribute("data-open-panel", "true");
});

test("a persistently visible handle still moves a block", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    for (const id of ["drag-one", "drag-two", "drag-three"]) {
      editor.blocks.insertBlock({ id, type: "paragraph", content: id });
    }
  });
  await page.getByRole("checkbox", { name: "Always show drag handles" }).check();
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  const handle = surface.locator('[data-block-id="drag-one"] .block-handle');
  const from = (await handle.boundingBox())!;
  const target = (await (
    await blockDropRegion(surface.locator('[data-block-id="drag-three"]'), "after")
  ).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await expect(surface.locator(".rivto-block-drag-preview")).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getRootIds(),
      ),
    )
    .toEqual(["drag-two", "drag-three", "drag-one"]);
});
