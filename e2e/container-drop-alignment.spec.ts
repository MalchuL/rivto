import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

type Layout = "outline" | "bento" | "kanban";
type Mode = "block" | "edgeless";

/**
 * Creates the same ordinary outline in the editor, a tile or a card.
 *
 * @param layout - Owner of the ordinary outline.
 * @returns A portable subtree with stable identities for depth assertions.
 */
function fixture(layout: Layout): EditorBlockInput {
  const writing: EditorBlockInput = {
    id: "writing",
    type: "paragraph",
    content: "Parent",
    children: [
      {
        id: "first",
        type: "paragraph",
        content: "First",
        children: [
          {
            id: "nested",
            type: "paragraph",
            content: "Nested",
            children: [
              {
                id: "nested2",
                type: "paragraph",
                content: "Nested 2",
                children: [{ id: "nested3", type: "paragraph", content: "Nested 3" }],
              },
            ],
          },
        ],
      },
      { id: "next", type: "paragraph", content: "Next" },
    ],
  };
  if (layout === "bento") {
    return { id: "container", type: "bento", children: [writing] };
  }
  if (layout === "kanban") {
    return {
      id: "container",
      type: "kanban",
      children: [{ id: "lane", type: "kanban-column", content: "Lane", children: [writing] }],
    };
  }
  return writing;
}

/**
 * Loads the fixture and clears setup history before the native gesture.
 *
 * @param page - Test-owned browser page.
 * @param layout - Layout hosting the shared ordinary outline.
 * @param mode - Surface in which to render it.
 * @returns Resolves when the selected surface is mounted.
 */
async function load(page: Page, layout: Layout, mode: Mode): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 1500 });
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(
    ({ target, mode }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      editor.blocks.insertBlock({ id: "source", type: "paragraph", content: "Source" });
      editor.blocks.insertBlock(target);
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 1000, height: 1200 },
          props: { startBlockId: "source", endBlockId: target.id },
        });
      }
      editor.history.clear();
    },
    { target: fixture(layout), mode },
  );
  await page.locator(`[data-editor-mode="${mode}"]`).click();
}

/**
 * Starts a native drag from the source handle.
 *
 * @param page - Browser page displaying the fixture.
 * @returns Resolves with the source captured by the drag gesture.
 */
async function startDrag(page: Page): Promise<void> {
  const row = page.locator('[data-block-id="source"] > .rivto-block-row');
  await row.hover();
  const handle = row.locator(".block-handle");
  await handle.hover();
  const box = (await handle.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 3 });
}

for (const layout of ["outline", "bento", "kanban"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    for (const rtl of [false, true]) {
      for (const customSlots of [false, true]) {
        for (const [depth, parent] of [
          [0, "writing"],
          [1, "first"],
          [2, "nested"],
          [3, "nested2"],
          [4, "nested3"],
        ] as const) {
          test(`content-aligned depth ${depth} in ${layout}, ${mode}, RTL=${rtl}, custom slots=${customSlots}`, async ({
            page,
          }) => {
            await load(page, layout, mode);
            await page.addStyleTag({
              content: `[data-block-id="writing"] { direction: ${rtl ? "rtl" : "ltr"}; ${customSlots ? "--rivto-block-control-size: 28px;" : ""} }`,
            });
            await startDrag(page);
            const first = (await page.locator('[data-block-id="first"]').boundingBox())!;
            const next = page.locator('[data-block-id="next"]');
            const nextBox = (await next.boundingBox())!;
            const writing = page.locator('[data-block-id="writing"]');
            const ownerBefore = (await writing.boundingBox())!;
            const indent = await next.evaluate((element) =>
              parseFloat(getComputedStyle(element).getPropertyValue("--rivto-block-indent")),
            );
            const content = (await next
              .locator(":scope > .rivto-block-row > .rivto-block-content")
              .boundingBox())!;
            const x = rtl
              ? content.x + content.width - 1 - depth * indent
              : content.x + 1 + depth * indent;
            await page.mouse.move(x, (first.y + first.height + nextBox.y) / 2, { steps: 8 });
            const line = page.locator(".rivto-block-drop-line:visible");
            await expect(line).toBeVisible();
            const indicator = (await line.boundingBox())!;
            for (const y of [
              first.y + first.height - 1,
              first.y + first.height - 3,
              first.y + first.height - 6,
              first.y + first.height - 10,
              nextBox.y + 1,
              first.y + first.height - 1,
              first.y + first.height - 10,
            ]) {
              await page.mouse.move(x, y);
              const current = (await line.boundingBox())!;
              expect(current.x).toBeCloseTo(indicator.x, 0);
              expect(current.y).toBeCloseTo(indicator.y, 0);
            }
            await page.mouse.up();
            await expect
              .poll(() =>
                page.evaluate(() =>
                  (
                    window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
                  ).__rivtoDemo.editor.blocks.getParentId("source"),
                ),
              )
              .toBe(parent);
            const inserted = (await page
              .locator('[data-block-id="source"] > .rivto-block-row > .rivto-block-content')
              .boundingBox())!;
            const ownerAfter = (await writing.boundingBox())!;
            if (rtl) {
              expect(ownerBefore.x + ownerBefore.width - indicator.x - indicator.width).toBeCloseTo(
                ownerAfter.x + ownerAfter.width - inserted.x - inserted.width,
                0,
              );
            } else {
              expect(indicator.x - ownerBefore.x).toBeCloseTo(inserted.x - ownerAfter.x, 0);
            }
            await page.keyboard.press("ControlOrMeta+z");
            await expect
              .poll(() =>
                page.evaluate(() =>
                  (
                    window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
                  ).__rivtoDemo.editor.blocks.getParentId("source"),
                ),
              )
              .toBeNull();
          });
        }
      }
    }
  }
}

for (const layout of ["outline", "bento", "kanban"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    for (const rtl of [false, true]) {
      for (const customSlots of [false, true]) {
        test(`first child boundary aligns with nested content in ${layout}, ${mode}, RTL=${rtl}, custom slots=${customSlots}`, async ({
          page,
        }) => {
          await load(page, layout, mode);
          await page.addStyleTag({
            content: `[data-block-id="writing"] { direction: ${rtl ? "rtl" : "ltr"}; ${customSlots ? "--rivto-block-control-size: 28px;" : ""} }`,
          });
          await startDrag(page);
          const parent = page.locator('[data-block-id="first"]');
          const parentBefore = (await parent.boundingBox())!;
          const child = page.locator('[data-block-id="nested"]');
          const row = (await child.locator(":scope > .rivto-block-row").boundingBox())!;
          const content = (await child
            .locator(":scope > .rivto-block-row > .rivto-block-content")
            .boundingBox())!;
          await page.mouse.move(rtl ? content.x + content.width - 1 : content.x + 1, row.y + 1, {
            steps: 8,
          });
          const line = page.locator(".rivto-block-drop-line:visible");
          await expect(line).toBeVisible();
          const indicator = (await line.boundingBox())!;
          for (const y of [row.y - 1, row.y + 1]) {
            await page.mouse.move(rtl ? content.x + content.width - 1 : content.x + 1, y);
            const current = (await line.boundingBox())!;
            expect(current.x).toBeCloseTo(indicator.x, 0);
            expect(current.width).toBeCloseTo(indicator.width, 0);
          }
          await page.mouse.up();
          await expect
            .poll(() =>
              page.evaluate(() =>
                (
                  window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
                ).__rivtoDemo.editor.blocks.getParentId("source"),
              ),
            )
            .toBe("first");
          expect(
            await page.evaluate(() =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getChildIds("first"),
            ),
          ).toEqual(["source", "nested"]);
          const inserted = (await page
            .locator('[data-block-id="source"] > .rivto-block-row > .rivto-block-content')
            .boundingBox())!;
          const parentAfter = (await parent.boundingBox())!;
          if (rtl) {
            expect(parentBefore.x + parentBefore.width - indicator.x - indicator.width).toBeCloseTo(
              parentAfter.x + parentAfter.width - inserted.x - inserted.width,
              0,
            );
          } else {
            expect(indicator.x - parentBefore.x).toBeCloseTo(inserted.x - parentAfter.x, 0);
          }
          await page.keyboard.press("ControlOrMeta+z");
          await expect
            .poll(() =>
              page.evaluate(() =>
                (
                  window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
                ).__rivtoDemo.editor.blocks.getParentId("source"),
              ),
            )
            .toBeNull();
        });
      }
    }
  }
}
