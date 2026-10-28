import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

const kinds = ["bento", "kanban", "columns", "todo-storage"] as const;
type Kind = (typeof kinds)[number];
type Placement = "first" | "between" | "last" | "nested";

/**
 * Reads the moved block's live parent for commit and undo assertions.
 *
 * @param page - Browser containing the test-owned demo document.
 * @returns Current parent identity, or undefined if the source is unavailable.
 */
async function sourceParent(page: Page): Promise<string | undefined> {
  return page.evaluate(() =>
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.blocks.getParentId("moving"),
  );
}

/**
 * Loads two native containers into the requested surface and clears setup history.
 *
 * @param page - Browser page owning the isolated document.
 * @param blocks - Source and receiving container inputs in display order.
 * @param mode - Surface in which real pointer gestures will execute.
 * @returns Resolves when the requested surface is selected.
 */
async function loadContainers(
  page: Page,
  blocks: EditorBlockInput[],
  mode: "block" | "edgeless",
): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 1600 });
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] .page-surface').first().waitFor();
  await page.evaluate(
    ({ blocks, mode }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      blocks.forEach((block) => editor.blocks.insertBlock(block));
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 1000, height: 1400 },
          props: { startBlockId: blocks[0]!.id, endBlockId: blocks[1]!.id },
        });
      }
      editor.history.clear();
    },
    { blocks, mode },
  );
  await page.locator(`[data-editor-mode="${mode}"]`).click();
}

/**
 * Verifies a real placement's feedback, persisted order and one-step undo.
 *
 * @param page - Browser containing the two mounted container lists.
 * @param placement - First, interior, last or child-depth destination.
 * @returns Resolves after undo restores the source list for the next sample.
 */
async function verifyPlacement(page: Page, placement: Placement): Promise<void> {
  const a = (await page.locator('[data-block-id="first"]').boundingBox())!;
  const b = (await page.locator('[data-block-id="last"]').boundingBox())!;
  let y = (a.y + a.height + b.y) / 2;
  if (placement === "first") {
    y = a.y + 1;
  } else if (placement === "last") {
    y = b.y + b.height - 1;
  }
  await drag(page, { x: a.x + (placement === "nested" ? 36 : 12), y });
  const line = page.locator(".rivto-block-drop-line:visible");
  await expect(line).toBeVisible();
  if (placement === "between") {
    const rect = (await line.boundingBox())!;
    expect(rect.y + rect.height / 2).toBeCloseTo(y, 0);
  }
  await page.mouse.up();
  await expect
    .poll(() => sourceParent(page))
    .toBe(placement === "nested" ? "first" : "target-list");
  const expected = ["first", "last"];
  if (placement !== "nested") {
    expected.splice(["first", "between", "last"].indexOf(placement), 0, "moving");
  }
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getChildIds("target-list"),
    ),
  ).toEqual(expected);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => sourceParent(page)).toBe("source-list");
}

/**
 * Builds a native container around an ordinary writing list.
 *
 * Bento uses a tile's outline; structural lanes remain outside the moved group.
 *
 * @param kind - Native container layout under test.
 * @param prefix - Stable source or destination identity prefix.
 * @param children - Ordinary blocks assigned to the content-list owner.
 * @returns Portable container with its writing owner named prefix-list.
 */
function container(kind: Kind, prefix: string, children: EditorBlockInput[]): EditorBlockInput {
  if (kind === "todo-storage") {
    return { id: `${prefix}-list`, type: kind, children };
  }
  let type = "paragraph";
  if (kind === "kanban" || kind === "columns") {
    type = `${kind}-column`;
  }
  return {
    id: prefix,
    type: kind,
    children: [{ id: `${prefix}-list`, type, content: "Writing", children }],
  };
}

/**
 * Drags the original source handle to a current viewport point.
 *
 * @param page - Browser page owning native mouse input.
 * @param point - Destination coordinates after scrolling the test fixture into view.
 * @returns Resolves with the mouse held at the destination so feedback can be checked.
 */
async function drag(page: Page, point: { x: number; y: number }): Promise<void> {
  const row = page.locator('[data-block-id="moving"] > .rivto-block-row');
  await row.hover();
  const handle = row.locator(".block-handle");
  await handle.hover();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(point.x, point.y, { steps: 12 });
}

for (const source of kinds) {
  for (const target of kinds) {
    for (const mode of ["block", "edgeless"] as const) {
      test(`matrix ${source} -> ${target} in ${mode}: first, between, last and nested`, async ({
        page,
      }) => {
        const blocks = [
          container(source, "source", [{ id: "moving", type: "paragraph", content: "Moving" }]),
          container(target, "target", [
            { id: "first", type: "paragraph", content: "First" },
            { id: "last", type: "paragraph", content: "Last" },
          ]),
        ];
        await loadContainers(page, blocks, mode);
        for (const placement of ["first", "between", "last", "nested"] as const) {
          await verifyPlacement(page, placement);
        }
      });
    }
  }
}
