import { expect, test, type Page } from "@playwright/test";

async function openDrawing(page: Page, repeat = 0) {
  await page.goto(`/?repeat=${repeat}`);
  const today = page.locator('[data-journal-document="today"]');
  await today.locator("[data-block-content]").first().waitFor();
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor;
    editor.elements.insertElement({ id: "resize-drawing", type: "drawing", frame: { x: 100, y: 100, width: 120, height: 80 }, zIndex: 3000,
      props: { points: [{ x: 10, y: 10, pressure: 0.4 }, { x: 110, y: 70, pressure: 0.8 }], stroke: "#222", strokeWidth: 4, opacity: 1, brush: "pen", rotation: 0 } });
    editor.commands.execute("edgeless.selection.set", ["resize-drawing"]);
  });
  const drawing = today.locator('[data-edgeless-object-id="resize-drawing"]');
  const controls = today.locator('[data-edgeless-controls-for="resize-drawing"]');
  await expect(controls).toBeVisible();
  const read = () => page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.elements.getElementNode("resize-drawing")!);
  return { today, drawing, controls, read };
}

for (const repeat of [0, 200]) {
  test(`drawing resize preserves the visible path after commit and remount, repeat=${repeat}`, async ({ page }) => {
    const { today, drawing, controls, read } = await openDrawing(page, repeat);
    const before = await read();
    const path = drawing.locator(".edgeless-drawing-stroke");
    const initialBox = (await path.boundingBox())!;
    const edge = (await controls.locator('[data-edgeless-resize-handle="e"]').boundingBox())!;
    await page.keyboard.down("Alt");
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2 + 60, edge.y + edge.height / 2, { steps: 6 });
    const preview = (await path.boundingBox())!;
    expect(preview.width).toBeCloseTo(initialBox.width + 50, 0);
    expect(await read()).toEqual(before);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect.poll(async () => (await path.boundingBox())!.width).toBeCloseTo(preview.width, 0);
    expect((await read()).props.points).toEqual([{ x: 15, y: 10, pressure: 0.4 }, { x: 165, y: 70, pressure: 0.8 }]);
    expect((await read()).props.strokeWidth).toBe(4);
    await today.locator('[data-editor-mode="block"]').click();
    await today.locator('[data-editor-mode="edgeless"]').click();
    await expect.poll(async () => (await path.boundingBox())!.width).toBeCloseTo(preview.width, 0);
    await page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.history.undo());
    await expect.poll(read).toEqual(before);
    await expect.poll(async () => (await path.boundingBox())!.width).toBeCloseTo(initialBox.width, 0);
  });
}

for (const direction of ["e", "se"]) {
  test(`Shift keeps the aspect ratio when resizing from ${direction}`, async ({ page }) => {
    const { controls, read } = await openDrawing(page);
    const before = await read();
    const handle = (await controls.locator(`[data-edgeless-resize-handle="${direction}"]`).boundingBox())!;
    await page.keyboard.down("Alt");
    await page.keyboard.down("Shift");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 90, handle.y + handle.height / 2 + 10, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.keyboard.up("Alt");
    const after = await read();
    expect(after.frame.width).toBeGreaterThan(before.frame.width + 30);
    expect(after.frame.width / after.frame.height).toBeCloseTo(before.frame.width / before.frame.height, 2);
  });
}

test("Shift can be pressed and released during resize", async ({ page }) => {
  const { drawing, controls, read } = await openDrawing(page);
  const handle = (await controls.locator('[data-edgeless-resize-handle="se"]').boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  const ratio = () => drawing.evaluate(element => Number.parseFloat((element as HTMLElement).style.width) / Number.parseFloat((element as HTMLElement).style.height));
  await page.keyboard.down("Alt");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 5, { steps: 3 });
  expect(await ratio()).toBeGreaterThan(1.6);
  await page.keyboard.down("Shift");
  await page.mouse.move(x + 60, y + 5, { steps: 3 });
  expect(await ratio()).toBeCloseTo(1.5, 2);
  await page.keyboard.up("Shift");
  await page.mouse.move(x + 90, y + 5, { steps: 3 });
  expect(await ratio()).toBeGreaterThan(1.8);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  expect((await read()).frame.width / (await read()).frame.height).toBeGreaterThan(1.8);
});

test("Shift resizes a group proportionally and preserves its drawing points", async ({ page }) => {
  const { today, read } = await openDrawing(page);
  const groupId = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor;
    editor.elements.insertElement({ id: "resize-sibling", type: "rectangle", frame: { x: 340, y: 100, width: 120, height: 80 }, zIndex: 3000, props: {} });
    editor.commands.execute("edgeless.selection.set", ["resize-drawing", "resize-sibling"]);
    return (editor.commands.execute("edgeless.selection.group") as { id: string }).id;
  });
  const handle = (await today.locator(`[data-edgeless-controls-for="${groupId}"] [data-edgeless-resize-handle="se"]`).boundingBox())!;
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 90, handle.y + handle.height / 2 + 5, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  const after = await read();
  expect(after.frame.width).toBeGreaterThan(130);
  expect(after.frame.width / after.frame.height).toBeCloseTo(1.5, 2);
  expect((after.props.points as Array<{ x: number }>)[1]!.x).toBeCloseTo(110 * after.frame.width / 120, 3);
});
