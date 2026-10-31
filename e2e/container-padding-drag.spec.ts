import { expect, test } from "@playwright/test";
import { blockDropRegion } from "./drop-regions";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  test(`ignores placement padding and drops in declared wrapped-card regions in ${mode}`, async ({
    page,
  }) => {
    await page.goto("/?test_features=1");
    await page.evaluate((mode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      editor.blocks.insertBlock({ id: "source", type: "paragraph", content: "Source" });
      editor.blocks.insertBlock({
        id: "board",
        type: "kanban",
        content: "Board",
        children: [
          {
            id: "lane",
            type: "kanban-column",
            content: "Lane",
            children: [
              { id: "first", type: "paragraph", content: "First" },
              { id: "last", type: "paragraph", content: "Last" },
            ],
          },
        ],
      });
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 900, height: 650 },
          props: { startBlockId: "source", endBlockId: "board" },
        });
      }
    }, mode);
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    // Exercise neutral layout wrappers without replacing registered primitives.
    await page
      .locator('[data-block-id="lane"]')
      .first()
      .evaluate((lane) => {
        const children = lane.querySelector(":scope > .rivto-block-children")!;
        const regions = [children, ...children.querySelectorAll(".rivto-block-row")];
        for (const region of regions) {
          const wrapper = document.createElement("section");
          region.before(wrapper);
          wrapper.append(region);
        }
      });
    const item = page.locator('[data-block-item-id="first"]').first();
    // Host item chrome may reserve padding outside the canonical child shell.
    await item.evaluate((element) => {
      (element as HTMLElement).style.paddingBottom = "16px";
    });
    const row = page.locator('[data-block-id="source"] > .rivto-block-row').first();
    await row.hover();
    const handle = row.locator(".block-handle");
    await handle.hover();
    const from = (await handle.boundingBox())!;
    const box = (await item.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 12, box.y + box.height - 4, { steps: 12 });
    await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(0);
    const gap = await blockDropRegion(page.locator('[data-block-id="first"]').first(), "after");
    const region = (await gap.boundingBox())!;
    await page.mouse.move(region.x + region.width / 2, region.y + region.height / 2);
    await expect(page.locator(".rivto-block-drop-line:visible")).toBeVisible();
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          return editor.blocks.getChildIds("lane");
        }),
      )
      .toEqual(["first", "source", "last"]);
  });
}
