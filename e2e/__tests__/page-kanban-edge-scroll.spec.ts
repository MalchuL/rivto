import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test("scrolls a Kanban while a dragged lane is held at its edge", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "board",
      type: "kanban",
      children: [
        { id: "first", type: "kanban-column", content: "First" },
        { id: "second", type: "kanban-column", content: "Second" },
        { id: "source", type: "kanban-column", content: "Moving lane" },
      ],
    });
  });
  const source = page.locator('[data-block-id="source"]');
  const second = page.locator('[data-block-id="second"]');
  await source.locator(":scope > .rivto-block-row").hover();
  await second.evaluate((lane) => {
    const host = lane.parentElement!;
    host.scrollLeft += lane.getBoundingClientRect().left - host.getBoundingClientRect().left - 32;
  });
  const handle = (await source.locator(".block-handle").first().boundingBox())!;
  const host = second.locator("xpath=..");
  const bounds = (await host.boundingBox())!;
  const before = await host.evaluate((element) => element.scrollLeft);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 12, bounds.y + bounds.height / 2, { steps: 12 });
  await expect(page.locator(".rivto-block-drag-preview")).toBeVisible();
  await expect.poll(() => host.evaluate((element) => element.scrollLeft)).toBeLessThan(before);
  await page.keyboard.press("Escape");
  const stopped = await host.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(150);
  expect(await host.evaluate((element) => element.scrollLeft)).toBe(stopped);
  await page.mouse.up();
  await expect(page.locator(".rivto-block-drag-preview")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getChildIds("board"),
    ),
  ).toEqual(["first", "second", "source"]);
});
