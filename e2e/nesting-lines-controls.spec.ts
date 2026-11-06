import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/**
 * Loads a numbered child list and optionally supplies its Edgeless card.
 *
 * @param page - Demo receiving the document fixture.
 * @param surface - Surface on which the fixture will be checked.
 * @param plainReference - Whether the second child has no list marker.
 * @returns Resolves after the document and its optional card are inserted.
 */
async function prepareNestedList(
  page: Page,
  surface: "block" | "edgeless",
  plainReference = false,
) {
  await page.evaluate(
    ({ mode, plainReference }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const parent = editor.blocks.insertBlock({
        id: "line-parent",
        type: "paragraph",
        content: "Parent",
        children: [
          {
            id: "line-first",
            type: "paragraph",
            content: "One",
            listProps: { type: "start_numbered_list" },
          },
          {
            id: "line-second",
            type: "paragraph",
            content: "Two",
            listProps: plainReference ? {} : { type: "numbered_list" },
          },
        ],
      });
      editor.load({ ...editor.dump(), blocks: [parent], elements: [], rootElementIds: [] });
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 700, height: 500 },
          props: { startBlockId: "line-parent", endBlockId: "line-parent" },
        });
      }
    },
    { mode: surface, plainReference },
  );
}

for (const mode of ["block", "edgeless"] as const) {
  test(`nesting lines do not paint over nested list controls in ${mode}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    const today = page.locator('[data-journal-document="today"]');
    await today.locator(".page-surface").first().waitFor();
    await prepareNestedList(page, mode);
    if (mode === "edgeless") {
      await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    }
    const markers = today.locator('[data-block-id="line-parent"] .page-list-marker');
    await expect(markers).toHaveCount(2);
    const overlays = page.locator("[data-nesting-lines]");
    await expect(overlays.first().locator("path")).toHaveAttribute("d", /^M /);
    for (const marker of await markers.all()) {
      await marker.scrollIntoViewIfNeeded();
      const withLines = await marker.screenshot({ animations: "disabled", caret: "hide" });
      await overlays.evaluateAll((elements) =>
        elements.forEach((element) => ((element as SVGElement).style.visibility = "hidden")),
      );
      const withoutLines = await marker.screenshot({ animations: "disabled", caret: "hide" });
      await overlays.evaluateAll((elements) =>
        elements.forEach((element) => ((element as SVGElement).style.visibility = "")),
      );
      expect(withLines).toEqual(withoutLines);
    }
  });
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["start_numbered_list", "checkbox"] as const) {
    for (const inside of [false, true]) {
      test(`aligns nesting when the first child is ${type}, inside=${inside}, ${mode}`, async ({
        page,
      }) => {
        await page.goto("/?test_features=1");
        await page.locator('[data-journal-document="today"] .page-surface').first().waitFor();
        await prepareNestedList(page, mode, true);
        await page.evaluate((listType) => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          editor.blocks.updateBlock("line-first", { listProps: { type: listType } });
        }, type);
        if (mode === "edgeless") {
          await page
            .locator('[data-journal-document="today"]')
            .getByRole("button", { name: "Edgeless", exact: true })
            .click();
        }
        const rows = page.locator(
          '[data-block-id="line-parent"] > .rivto-block-children > [data-block-id] > .rivto-block-row',
        );
        if (inside) {
          await rows.evaluateAll((elements) =>
            elements.forEach((row) => ((row as HTMLElement).dataset.controlsPlacement = "inside")),
          );
        }
        const path = page.locator("[data-nesting-lines] path").first();
        await expect
          .poll(async () => {
            const reference = await rows.nth(1).evaluate((row) => {
              const content = row.querySelector<HTMLElement>(":scope > .rivto-block-content")!;
              const style = getComputedStyle(row);
              return (
                content.getBoundingClientRect().left -
                parseFloat(style.paddingInlineStart) -
                parseFloat(style.columnGap)
              );
            });
            const actual = await path.evaluate((element) => {
              const d = element.getAttribute("d") ?? "";
              const x = d.match(/^M\s+([-\d.]+)/)?.[1];
              return x === undefined
                ? NaN
                : Number(x) + element.ownerSVGElement!.getBoundingClientRect().left;
            });
            return Math.abs(actual - reference);
          })
          .toBeLessThan(0.5);
      });
    }
  }
}
