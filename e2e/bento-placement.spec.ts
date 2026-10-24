import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Native tile edge, independent of reserved strip markup in either renderer. */
type TileEdge = "top" | "bottom" | "left" | "right";

/**
 * Mounts the same canonical Bento hierarchy on main and the current Page API.
 *
 * The alternate class selectors only accommodate renderer markup. Destinations,
 * pointer positions relative to content and persisted-order assertions are shared.
 *
 * @param page - Production demo controlled by native pointer input.
 * @param wrapped - Whether the two stationary tiles occupy separate visual rows.
 * @param nested - Whether the first tile contains an expanded writing subtree.
 * @returns Resolves after the fixture and its declared width are mounted.
 */
async function loadBento(page: Page, wrapped: boolean, nested = false): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 1200 });
  await page.goto("/");
  await page.locator(".page-surface").first().waitFor();
  await page.evaluate((nested) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "board",
      type: "bento",
      children: [
        {
          id: "first",
          type: "paragraph",
          content: "First tile",
          children: nested
            ? [
                {
                  id: "upper",
                  type: "paragraph",
                  content: "Upper",
                  children: [
                    { id: "grandchild", type: "paragraph", content: "Expanded descendant" },
                  ],
                },
                { id: "lower", type: "paragraph", content: "Lower" },
              ]
            : [],
        },
        { id: "last", type: "paragraph", content: "Last tile" },
      ],
    });
    editor.blocks.insertBlock({ id: "moving", type: "paragraph", content: "Moving" });
    editor.history.clear();
  }, nested);
  await page
    .locator('[data-block-id="board"] > :is(.rivto-block-children, .page-block-children)')
    .evaluate((host, wrapped) => {
      host.style.width = wrapped ? "340px" : "700px";
    }, wrapped);
}

/**
 * Moves an ordinary root from its actual handle to the requested viewport point.
 *
 * @param page - Browser owning the mounted source and destination.
 * @param point - Final pointer location in viewport CSS pixels.
 * @returns Resolves with the primary button held for feedback assertions.
 */
async function dragTo(page: Page, point: { x: number; y: number }): Promise<void> {
  const row = page.locator('[data-block-id="moving"] > :is(.rivto-block-row, .page-block-row)');
  await row.hover();
  const handle = (await row.locator(".block-handle, .page-drag-handle").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 8 });
}

/**
 * Checks hierarchy after native release and restores the whole operation with one undo.
 *
 * @param page - Browser whose pointer remains held.
 * @param parent - Actual destination parent, not its visual container ancestor.
 * @param children - Expected complete ordered child list after insertion.
 * @returns Resolves after commit and undo restore the source's original root placement.
 */
async function commitAndUndo(page: Page, parent: string, children: string[]): Promise<void> {
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate((parent) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return {
          parent: editor.blocks.getParentId("moving"),
          children: editor.blocks.getBlockNode(parent)?.childIds,
        };
      }, parent),
    )
    .toEqual({ parent, children });
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getRootIds(),
      ),
    )
    .toEqual(["board", "moving"]);
}

/**
 * Finds a point within a painted tile rim rather than an implementation-specific strip.
 *
 * @param box - Complete canonical tile bounds including its own padding.
 * @param edge - Physical rim to approach.
 * @param inset - Distance into the painted tile in CSS pixels.
 * @returns Viewport point at the chosen edge's midpoint.
 */
function edgePoint(
  box: { x: number; y: number; width: number; height: number },
  edge: TileEdge,
  inset: number,
): { x: number; y: number } {
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (edge === "top") {
    point.y = box.y + inset;
  }
  if (edge === "bottom") {
    point.y = box.y + box.height - inset;
  }
  if (edge === "left") {
    point.x = box.x + inset;
  }
  if (edge === "right") {
    point.x = box.x + box.width - inset;
  }
  return point;
}

/**
 * Checks that an internal tile gap uses full placement bounds and its visual axis.
 *
 * @param page - Browser with an active drag and visible insertion line.
 * @param wrapped - Whether the stationary items occupy separate rows.
 * @returns Resolves after feedback is centered between the two stationary items.
 */
async function expectTileGap(page: Page, wrapped: boolean): Promise<void> {
  const bounds = await page.evaluate(() =>
    ["first", "last"].map((id) => {
      const shell = document.querySelector(`[data-block-id="${id}"]`)!;
      const rect = (shell.closest(".rivto-bento-tile") ?? shell).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }),
  );
  const line = (await page
    .locator('.rivto-block-drop-line:visible, .page-drop-indicator[data-kind="between"]:visible')
    .boundingBox())!;
  if (wrapped) {
    expect(line.y + line.height / 2).toBeCloseTo((bounds[0].bottom + bounds[1].top) / 2, 0);
    expect(line.width).toBeGreaterThan(line.height);
  } else {
    expect(line.x + line.width / 2).toBeCloseTo((bounds[0].right + bounds[1].left) / 2, 0);
    expect(line.height).toBeGreaterThan(line.width);
  }
}

for (const wrapped of [false, true]) {
  for (const tile of ["first", "last"]) {
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      for (const inset of [1, 4, 7]) {
        test(`Bento ${wrapped ? "wrapped" : "inline"} ${tile} tile ${edge} rim inset=${inset} preserves sibling placement`, async ({
          page,
        }) => {
          await loadBento(page, wrapped);
          const box = (await page.locator(`[data-block-id="${tile}"]`).boundingBox())!;
          const before = edge === "top" || edge === "left";

          await dragTo(page, edgePoint(box, edge, inset));
          const line = page.locator(
            '.rivto-block-drop-line:visible, .page-drop-indicator[data-kind="between"]:visible',
          );
          await expect(line).toHaveCount(1);
          if ((tile === "first" && !before) || (tile === "last" && before)) {
            await expectTileGap(page, wrapped);
          }
          const order = ["first", "last"];
          order.splice(order.indexOf(tile) + Number(!before), 0, "moving");
          await commitAndUndo(page, "board", order);
        });
      }
    }
  }
  for (const nested of [false, true]) {
    test(`Bento ${wrapped ? "wrapped" : "inline"} expanded tile writing gap nested=${nested}`, async ({
      page,
    }) => {
      await loadBento(page, wrapped, true);
      const upper = (await page.locator('[data-block-id="upper"]').boundingBox())!;
      const lower = (await page.locator('[data-block-id="lower"]').boundingBox())!;
      await dragTo(page, {
        x: lower.x + (nested ? 36 : 12),
        y: (upper.y + upper.height + lower.y) / 2,
      });
      await expect(
        page.locator(
          '.rivto-block-drop-line:visible, .page-drop-indicator[data-kind="between"]:visible',
        ),
      ).toHaveCount(1);
      await commitAndUndo(
        page,
        nested ? "upper" : "first",
        nested ? ["grandchild", "moving"] : ["upper", "moving", "lower"],
      );
    });
  }
}
