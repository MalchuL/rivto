import { expect, test, type Page } from "@playwright/test";

async function openShape(page: Page) {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  await today.locator("[data-block-content]").first().waitFor();
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor;
    editor.elements.insertElement({ id: "moveable-shape", type: "rectangle", frame: { x: 100, y: 100, width: 180, height: 120 }, zIndex: 1000, props: { text: "Resize this text", fontSize: 16, strokeWidth: 3 } });
    editor.commands.execute("edgeless.selection.set", ["moveable-shape"]);
  });
  const controls = today.locator('[data-edgeless-controls-for="moveable-shape"]');
  await expect(controls).toBeVisible();
  return { today, controls, shape: today.locator('[data-edgeless-visual-kind="rectangle"][data-edgeless-object-id="moveable-shape"]') };
}

async function readShape(page: Page) {
  return page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.elements.getElementNode("moveable-shape")!);
}

test("Moveable resizes HTML content without scaling its text and records one undo step", async ({ page }) => {
  const { controls, shape } = await openShape(page);
  const before = await readShape(page);
  const handle = await controls.locator('[data-edgeless-resize-handle="e"]').boundingBox();
  if (!handle) throw new Error("Missing resize handle");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, { steps: 5 });
  expect((await readShape(page)).frame).toEqual(before.frame);
  await page.mouse.up();
  await expect.poll(async () => (await readShape(page)).frame.width).toBeGreaterThan(before.frame.width + 40);
  expect((await readShape(page)).frame.height).toBeCloseTo(before.frame.height);
  expect((await readShape(page)).props.fontSize).toBe(16);
  expect((await readShape(page)).props.strokeWidth).toBe(3);
  await expect(shape.locator(".edgeless-shape-label")).toHaveCSS("font-size", "16px");
  await page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.history.undo());
  await expect.poll(async () => (await readShape(page)).frame).toEqual(before.frame);
});

test("Moveable cancels a resize without persisting its preview", async ({ page }) => {
  const { controls, shape } = await openShape(page);
  const before = await readShape(page);
  const box = await shape.boundingBox();
  const handle = await controls.locator('[data-edgeless-resize-handle="nw"]').boundingBox();
  if (!handle || !box) throw new Error("Missing resize geometry");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 60, handle.y - 40, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await readShape(page)).frame).toEqual(before.frame);
  const after = await shape.boundingBox();
  expect(after!.x).toBeCloseTo(box.x);
  expect(after!.width).toBeCloseTo(box.width);
});

test("Moveable handles keep their screen size when zooming and support keyboard resize", async ({ page }) => {
  const { today, controls } = await openShape(page);
  const handle = controls.locator('[data-edgeless-resize-handle="e"]');
  const before = await handle.boundingBox();
  await today.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(today.locator(".edgeless-viewport")).toHaveAttribute("data-edgeless-zoom", "1.1");
  await expect.poll(async () => (await handle.boundingBox())!.width).toBeCloseTo(before!.width, 0);
  await page.keyboard.down("Alt");
  await handle.focus();
  const initial = await readShape(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await readShape(page)).frame.width).toBeGreaterThan(initial.frame.width);
  expect((await readShape(page)).frame.x).toBe(initial.frame.x);
});

test("Moveable restores both the object and its handles when rotation is cancelled", async ({ page }) => {
  const { controls, shape } = await openShape(page);
  const handle = controls.locator('[data-edgeless-rotation-handle]');
  const start = await handle.boundingBox();
  const object = await shape.boundingBox();
  if (!start || !object) throw new Error("Missing rotation geometry");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(object.x + object.width + 50, object.y + object.height / 2, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await readShape(page)).props.rotation ?? 0).toBe(0);
  await expect.poll(async () => (await handle.boundingBox())!.x).toBeCloseTo(start.x, 0);
  await expect.poll(async () => (await handle.boundingBox())!.y).toBeCloseTo(start.y, 0);
});

test("Moveable resizes a rotated element while keeping the opposite edge fixed", async ({ page }) => {
  const { controls, shape } = await openShape(page);
  await page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.elements.updateElement("moveable-shape", { props: { rotation: 90 } }));
  await expect.poll(() => shape.evaluate(el => { const m = new DOMMatrix(getComputedStyle(el).transform); return [m.a, m.b, m.c, m.d]; })).toEqual([0, 1, -1, 0]);
  const before = await shape.boundingBox();
  const handle = await controls.locator('[data-edgeless-resize-handle="e"]').boundingBox();
  if (!before || !handle) throw new Error("Missing rotated geometry");
  await page.keyboard.down("Alt");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await readShape(page)).frame.width).toBeCloseTo(240);
  const after = await shape.boundingBox();
  expect(after!.x).toBeCloseTo(before.x, 0);
  expect(after!.y).toBeCloseTo(before.y, 0);
  expect(after!.width).toBeCloseTo(before.width, 0);
  expect(after!.height).toBeCloseTo(before.height + 60, 0);
});

for (const kind of ["block", "report", "shape"] as const) {
  test(`Moveable preserves ${kind} rotation through rerender, resize, undo and remount`, async ({ page }) => {
    const { today } = await openShape(page);
    const id = await page.evaluate((kind) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor;
      const types = { block: "block", report: "demo.review", shape: "rectangle" };
      const element = editor.elements.getElementNodes().find((element) => element.type === types[kind])!;
      editor.elements.updateElement(element.id, { frame: { x: 120, y: 120, width: 360, height: 240 }, props: kind === "block" ? { autoHeight: false } : undefined });
      editor.commands.execute("edgeless.selection.set", [element.id]);
      return element.id;
    }, kind);
    const controls = today.locator(`[data-edgeless-controls-for="${id}"]`);
    const host = today.locator(`[data-edgeless-object-id="${id}"]`);
    const handle = controls.locator("[data-edgeless-rotation-handle]");
    await expect(handle).toBeVisible();
    const start = await handle.boundingBox();
    const object = await host.boundingBox();
    if (!start || !object) throw new Error("Missing rotation geometry");
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(object.x + object.width + 60, object.y + object.height / 2, { steps: 5 });
    const preview = await host.evaluate((host) => host.style.transform);
    expect(preview).toMatch(/rotate\(/);
    // A fresh element snapshot must not replace the in-progress DOM preview.
    await page.evaluate((id) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor;
      editor.elements.updateElement(id, { zIndex: 2000 });
    }, id);
    await today.locator(".edgeless-viewport").dispatchEvent("wheel", { ctrlKey: true, deltaY: -Math.log(1.1) / 0.002, clientX: object.x, clientY: object.y });
    await expect(today.locator(".edgeless-viewport")).toHaveAttribute("data-edgeless-zoom", "1.1");
    await expect.poll(() => host.evaluate((host) => host.style.transform)).toBe(preview);
    await page.mouse.up();
    const readAngle = () => page.evaluate((id) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor;
      return Number(editor.elements.getElementNode(id)!.props.rotation ?? 0);
    }, id);
    await expect.poll(readAngle).not.toBe(0);
    const angle = await readAngle();
    await expect.poll(() => host.evaluate((host) => Number(host.style.transform.match(/rotate\(([^)]+)deg\)/)?.[1]))).toBeCloseTo(angle, 3);
    await page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.history.undo());
    await expect.poll(readAngle).toBe(0);
    await expect.poll(() => host.evaluate((host) => host.style.transform)).toMatch(/rotate\(0deg\)$/);
    await page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.history.redo());
    await expect.poll(readAngle).toBe(angle);
    await controls.locator('[data-edgeless-resize-handle="e"]').focus();
    await page.keyboard.press("Alt+Shift+ArrowRight");
    expect(await readAngle()).toBe(angle);
    await today.getByRole("button", { name: "Page", exact: true }).click();
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    await expect.poll(() => host.evaluate((host) => Number(host.style.transform.match(/rotate\(([^)]+)deg\)/)?.[1]))).toBeCloseTo(angle, 3);
  });
}

test("Moveable follows the object throughout a drag and restores its controls on Escape", async ({ page }) => {
  const { shape, controls } = await openShape(page);
  const object = await shape.boundingBox();
  const handle = controls.locator('[data-edgeless-resize-handle="e"]');
  const before = await handle.boundingBox();
  if (!object || !before) throw new Error("Missing drag geometry");
  await page.keyboard.down("Alt");
  await page.mouse.move(object.x + 20, object.y + 20);
  await page.mouse.down();
  await page.mouse.move(object.x + 80, object.y + 60, { steps: 6 });
  await expect.poll(async () => (await handle.boundingBox())!.x).toBeCloseTo(before.x + 60, 0);
  await expect.poll(async () => (await handle.boundingBox())!.y).toBeCloseTo(before.y + 40, 0);
  expect((await readShape(page)).frame.x).toBe(100);
  await page.keyboard.up("Alt");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(async () => (await handle.boundingBox())!.x).toBeCloseTo(before.x, 0);
  expect((await readShape(page)).frame.x).toBe(100);
});

test("Moveable uses the same object alignment for dragging and resizing", async ({ page }) => {
  const { today, shape, controls } = await openShape(page);
  await today.getByRole("button", { name: "Disable snap to grid", exact: true }).click();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor;
    editor.elements.updateElement("demo-review-element", { frame: { x: 400, y: 400, width: 300, height: 200 } });
  });
  await shape.scrollIntoViewIfNeeded();
  const object = await shape.boundingBox();
  if (!object) throw new Error("Missing object geometry");
  await page.mouse.move(object.x + 20, object.y + 20);
  await page.mouse.down();
  await page.mouse.move(object.x + 137, object.y + 20, { steps: 6 });
  await expect(today.locator(".moveable-guideline").first()).toBeVisible();
  await today.locator(".edgeless-viewport").evaluate((element) => {
    (element as HTMLElement).style.setProperty("--rivto-edgeless-snap-guide", "rgb(18, 120, 88)");
  });
  const solid = today.locator(".moveable-guideline.moveable-bold").first();
  await expect(solid).toHaveCSS("background-color", "rgb(18, 120, 88)");
  const solidBox = await solid.boundingBox();
  expect(Math.min(solidBox!.width, solidBox!.height)).toBeCloseTo(2, 1);
  const gap = today.locator(".moveable-guideline.moveable-dashed.moveable-vertical").first();
  await expect(gap).toHaveCSS("border-left-color", "rgb(18, 120, 88)");
  await expect(gap).toHaveCSS("border-left-style", "dashed");
  await expect(gap).toHaveCSS("border-left-width", "1px");
  await page.mouse.up();
  await expect.poll(async () => (await readShape(page)).frame.x).toBe(220);
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor;
    editor.elements.updateElement("moveable-shape", { frame: { x: 100 } });
  });
  const handle = await controls.locator('[data-edgeless-resize-handle="e"]').boundingBox();
  if (!handle) throw new Error("Missing resize geometry");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 117, handle.y + handle.height / 2, { steps: 6 });
  await expect(today.locator(".moveable-guideline").first()).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => (await readShape(page)).frame.width).toBe(300);
  expect((await readShape(page)).frame.x).toBe(100);
});

for (const type of ["rectangle", "block", "demo.review"]) {
  test(`Moveable border moves ${type} without a canvas drag handle`, async ({ page }) => {
    const { today } = await openShape(page);
    const id = await page.evaluate(type => {
      const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor;
      const element = editor.elements.getElementNodes().find(element => element.type === type)!;
      editor.elements.updateElement(element.id, { frame: { x: 120, y: 120, width: 360, height: 240 }, zIndex: 3000, props: type === "block" ? { autoHeight: false } : undefined });
      editor.commands.execute("edgeless.selection.set", [element.id]);
      return element.id;
    }, type);
    const edge = today.locator(`[data-edgeless-controls-for="${id}"] .moveable-edgeDraggable[data-direction="w"]`);
    await expect(edge).toBeVisible();
    await expect(today.locator("[data-edgeless-drag-handle]")).toHaveCount(0);
    const box = (await edge.boundingBox())!;
    const read = () => page.evaluate(id => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.elements.getElementNode(id)!.frame, id);
    const before = await read();
    await page.keyboard.down("Alt");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 4 + 20, { steps: 5 });
    expect(await read()).toEqual(before);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect.poll(read).toEqual({ ...before, x: before.x + 40, y: before.y + 20 });
    await page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }).__rivtoDemo.editor.history.undo());
    await expect.poll(read).toEqual(before);
  });
}
