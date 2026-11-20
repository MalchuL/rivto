import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test("lost pointer capture cancels Bento resize without committing its preview", async ({
  page,
}) => {
  await page.goto("/");
  const board = page.locator('[data-block-type="bento"]').first();
  await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
  const tile = board.locator(":scope > .rivto-block-children > .rivto-bento-tile").first();
  const blockId = await tile.locator("[data-block-id]").first().getAttribute("data-block-id");
  const before = await page.evaluate((id) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    return editor.blocks.getBlockNode(id!)?.props.bentoWidth;
  }, blockId);
  await tile.hover();
  const handle = tile.getByRole("separator", { name: "Resize Bento tile from the right" });
  await handle.evaluate((element) => {
    element.addEventListener(
      "pointerdown",
      (event) => {
        (window as unknown as { bentoPointerId: number }).bentoPointerId = event.pointerId;
      },
      { once: true },
    );
  });
  const bounds = (await handle.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y);
  await expect(tile).toHaveAttribute("data-bento-resizing", "right");
  await handle.evaluate((element) => {
    element.releasePointerCapture((window as unknown as { bentoPointerId: number }).bentoPointerId);
  });
  await page.mouse.move(x + 51, y);
  await expect(tile).not.toHaveAttribute("data-bento-resizing");
  await page.mouse.up();
  const after = await page.evaluate((id) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    return editor.blocks.getBlockNode(id!)?.props.bentoWidth;
  }, blockId);
  expect(after).toEqual(before);
});
