import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  test(`Bento corner and bottom handles resize and restore both axes in ${mode}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/?test_features=1");
    const ids = await page.evaluate((mode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const board = editor.blocks.insertBlock({
        type: "bento",
        children: [
          {
            type: "paragraph",
            content: "Resize me",
            listProps: { style: { size: { width: "180px", height: "120px" } } },
            children: [
              {
                type: "paragraph",
                content: "Tall child",
                listProps: { style: { size: { height: "300px" } } },
              },
            ],
          },
        ],
      });
      editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 900, height: 700 },
          props: { startBlockId: board.id, endBlockId: board.id },
        });
      }
      editor.history.clear();
      return { board: board.id, tile: board.children[0]!.id };
    }, mode);
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    const block = page.locator(`[data-block-id="${ids.tile}"]`).first();
    const tile = block.locator(
      "xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' rivto-bento-tile ')][1]",
    );
    const corner = tile.getByRole("button", { name: "Resize Bento tile from the bottom-right" });
    const initial = await block.boundingBox();
    const startWidth = (await tile.boundingBox())!.width;
    const handle = (await corner.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2 - 50, {
      steps: 5,
    });
    await expect(tile).toHaveAttribute("data-width-resizing", "bottom-right");
    await page.mouse.up();
    const read = () =>
      page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.blocks.getBlockNode(id)?.listProps.style;
      }, ids.tile);
    await expect
      .poll(async () => ((await read()) as { size: { width: string } }).size.width)
      .toBe(`${Math.round(startWidth + 30)}px`);
    const style = (await read()) as { size: { height: string; heightPolicy: string } };
    expect(parseFloat(style.size.height)).toBeCloseTo(initial!.height - 50, 0);
    expect(style.size.heightPolicy).toBe("scroll");
    await expect(block).toHaveCSS("overflow-y", "auto");
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.history.undo(),
    );
    expect(await read()).toMatchObject({
      size: { width: `${Math.round(startWidth)}px`, height: "120px" },
    });
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.history.redo(),
    );
    const bottom = tile.getByRole("separator", { name: "Resize Bento tile from the bottom" });
    const beforeBottom = (await read()) as { size: { width: string; height: string } };
    const dragBottom = (await bottom.boundingBox())!;
    await page.mouse.move(
      dragBottom.x + dragBottom.width / 2,
      dragBottom.y + dragBottom.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      dragBottom.x + dragBottom.width / 2,
      dragBottom.y + dragBottom.height / 2 + 20,
      { steps: 4 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => parseFloat(((await read()) as { size: { height: string } }).size.height))
      .toBe(parseFloat(beforeBottom.size.height) + 20);
    expect(((await read()) as { size: { width: string } }).size.width).toBe(
      beforeBottom.size.width,
    );
    await bottom.focus();
    const previousHeight = parseFloat(((await read()) as { size: { height: string } }).size.height);
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(async () => parseFloat(((await read()) as { size: { height: string } }).size.height))
      .toBe(previousHeight + 10);
    const beforeCancel = await read();
    const bottomBox = (await bottom.boundingBox())!;
    await page.mouse.move(bottomBox.x + bottomBox.width / 2, bottomBox.y + bottomBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(bottomBox.x + bottomBox.width / 2, bottomBox.y + 30);
    await expect(tile).toHaveAttribute("data-width-resizing", "bottom");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await read()).toEqual(beforeCancel);
    await page.evaluate(({ tile, board }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.moveBlocks([tile], board, "after");
    }, ids);
    expect(await read()).toMatchObject({ size: { width: "180px", height: "120px" } });
  });
}
