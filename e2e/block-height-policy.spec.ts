import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  test(`height policies and stylesheet overrides apply to blocks and Bento tiles in ${mode}`, async ({
    page,
  }) => {
    await page.goto("/?test_features=1");
    await page.locator('[data-journal-document="today"] [data-block-id]').first().waitFor();
    const ids = await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const make = (heightPolicy?: "grow" | "scroll" | "clip") => ({
        type: "paragraph",
        content: heightPolicy ?? "default",
        listProps: { style: { size: { height: "80", ...(heightPolicy && { heightPolicy }) } } },
        children: [
          {
            type: "paragraph",
            content: "tall child",
            listProps: { style: { size: { height: "200" } } },
          },
        ],
      });
      const policies = [undefined, "grow", "scroll", "clip"] as const;
      const blocks = policies.map((policy) => editor.blocks.insertBlock(make(policy)));
      const board = editor.blocks.insertBlock({
        type: "bento",
        children: policies.map((policy) => make(policy)),
      });
      return [blocks.map((block) => block.id), board.children.map((block) => block.id)];
    });
    if (mode === "edgeless") {
      await page.getByRole("button", { name: "Edgeless", exact: true }).first().click();
    }
    for (const group of ids) {
      for (const [index, policy] of ["default", "grow", "scroll", "clip"].entries()) {
        const block = page.locator(`[data-block-id="${group[index]}"]`).first();
        await block.scrollIntoViewIfNeeded();
        const metrics = await block.evaluate((element) => ({
          height: element.getBoundingClientRect().height,
          scrollHeight: element.scrollHeight,
          overflow: getComputedStyle(element).overflowY,
        }));
        if (policy === "default" || policy === "grow") {
          expect(metrics.height).toBeGreaterThan(200);
        } else {
          expect(metrics.height).toBe(80);
          expect(metrics.scrollHeight).toBeGreaterThan(80);
          expect(metrics.overflow).toBe(policy === "scroll" ? "auto" : "hidden");
          if (policy === "scroll") {
            expect(
              await block.evaluate((element) => {
                element.scrollTop = 40;
                return element.scrollTop;
              }),
            ).toBeGreaterThan(0);
          }
        }
      }
      const clipped = page.locator(`[data-block-id="${group[3]}"]`).first();
      await page.addStyleTag({
        content: `.rivto-block[data-block-id="${group[3]}"] { height: 120px; overflow-y: auto; }`,
      });
      await expect(clipped).toHaveCSS("height", "120px");
      await expect(clipped).toHaveCSS("overflow-y", "auto");
    }
  });
}
