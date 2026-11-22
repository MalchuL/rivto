import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  test(`width policies constrain blocks and Bento tiles in ${mode}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.locator('[data-journal-document="today"] [data-block-id]').first().waitFor();
    const ids = await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const create = (widthPolicy: "grow" | "scroll" | "clip") => ({
        type: "paragraph",
        content: widthPolicy,
        listProps: {
          style: { size: { width: "200px", height: "80px", heightPolicy: "scroll", widthPolicy } },
        },
        children: [
          {
            type: "paragraph",
            content: "Wide child",
            listProps: { style: { size: { width: "600px" } } },
          },
        ],
      });
      const blocks = (["grow", "scroll", "clip"] as const).map((policy) =>
        editor.blocks.insertBlock(create(policy)),
      );
      const board = editor.blocks.insertBlock({
        type: "bento",
        children: (["grow", "scroll", "clip"] as const).map((policy) => ({
          ...create(policy),
          pluginData: { bentoWidth: 200 },
        })),
      });
      return {
        blocks: blocks.map((block) => block.id),
        tiles: board.children.map((block) => block.id),
      };
    });
    if (mode === "edgeless") {
      await page.getByRole("button", { name: "Edgeless", exact: true }).first().click();
    }
    for (const idsForSurface of [ids.blocks, ids.tiles]) {
      for (const [index, policy] of ["grow", "scroll", "clip"].entries()) {
        const block = page.locator(`[data-block-id="${idsForSurface[index]}"]`).first();
        await block.scrollIntoViewIfNeeded();
        await expect(block).toHaveCSS("overflow-y", "auto");
        const geometry = await block.evaluate((element) => ({
          width: element.getBoundingClientRect().width,
          scrollWidth: element.scrollWidth,
          overflow: getComputedStyle(element).overflowX,
        }));
        if (policy === "grow") {
          expect(geometry.width).toBeGreaterThan(200);
        } else {
          expect(geometry.width).toBeLessThanOrEqual(200);
          expect(geometry.scrollWidth).toBeGreaterThan(geometry.width);
          expect(geometry.overflow).toBe(policy === "scroll" ? "auto" : "hidden");
          if (policy === "scroll") {
            expect(
              await block.evaluate((element) => {
                element.scrollLeft = 40;
                return element.scrollLeft;
              }),
            ).toBeGreaterThan(0);
          }
        }
        if (idsForSurface === ids.tiles) {
          const widths = await block.evaluate((element) => {
            const tile = element.closest(".rivto-bento-tile")!;
            const content = tile.querySelector(".rivto-block-drop-wrapper-content")!;
            return {
              shell: element.getBoundingClientRect().width,
              content: content.getBoundingClientRect().width,
              tile: tile.getBoundingClientRect().width,
              container: tile.parentElement!.getBoundingClientRect().width,
            };
          });
          expect(widths.shell).toBeCloseTo(widths.content, 0);
          expect(widths.tile).toBeLessThanOrEqual(Math.min(widths.container, 960));
        }
      }
    }
  });
}
