import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorElementNode } from "@chulane/rivto";

type DemoWindow = Window & { __rivtoDemo: { editor: DocumentEditorAPI } };

async function openGroup(page: Page, repeat = 0) {
  await page.goto(repeat ? `/?repeat=${repeat}` : "/");
  const today = page.locator('[data-journal-document="today"]');
  await today.locator("[data-block-content]").first().waitFor();
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  const id = await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    for (const [id, x] of [["group-a", 100], ["group-b", 340]] as const) {
      editor.elements.insertElement({ id, type: "rectangle", frame: { x, y: 120, width: 120, height: 100 }, zIndex: 3000, props: { text: id, fontSize: 16 } });
    }
    editor.commands.execute("edgeless.selection.set", ["group-a", "group-b"]);
    return (editor.commands.execute("edgeless.selection.group") as EditorElementNode).id;
  });
  return { today, id, controls: today.locator(`[data-edgeless-controls-for="${id}"]`) };
}

async function readChildren(page: Page) {
  return page.evaluate(() => ["group-a", "group-b"].map(id => (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(id)!));
}

for (const repeat of [0, 200]) {
  test(`group resize and rotation use Moveable and commit together (${repeat})`, async ({ page }) => {
    const { controls, today } = await openGroup(page, repeat);
    const before = await readChildren(page);
    const east = controls.locator('[data-edgeless-resize-handle="e"]');
    await expect(east).toBeVisible();
    const handle = (await east.boundingBox())!;
    await page.keyboard.down("Alt");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 90, handle.y + handle.height / 2, { steps: 6 });
    expect(await readChildren(page)).toEqual(before);
    const preview = today.locator('[data-edgeless-object-id="group-a"]');
    await expect.poll(() => preview.evaluate(host => Number.parseFloat(host.style.width))).toBeGreaterThan(140);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect.poll(async () => (await readChildren(page))[0].frame.width).toBeGreaterThan(140);
    const resized = await readChildren(page);
    expect(resized[1].frame.width).toBeCloseTo(resized[0].frame.width);
    expect(resized[0].frame.width / resized[0].frame.height).toBeCloseTo(before[0].frame.width / before[0].frame.height);
    expect(resized[1].frame.x).toBeGreaterThan(before[1].frame.x);
    expect(resized[0].props.fontSize).toBe(16);
    await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.undo());
    await expect.poll(() => readChildren(page)).toEqual(before);
    const rotate = controls.locator('[data-edgeless-rotation-handle]');
    await rotate.focus();
    await page.keyboard.press("Alt+Shift+ArrowRight");
    await expect.poll(async () => Number((await readChildren(page))[0].props.rotation)).toBeCloseTo(10);
    const rotated = await readChildren(page);
    expect(rotated[1].props.rotation).toBeCloseTo(10);
    expect(rotated[1].frame.y).toBeGreaterThan(rotated[0].frame.y);
    await today.getByRole("button", { name: "Page", exact: true }).click();
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    expect(await readChildren(page)).toEqual(rotated);
  });
}

test("group drag bounds follow the children and cancelled rotation restores every frame", async ({ page }) => {
  const { controls, today, id } = await openGroup(page);
  const before = await readChildren(page);
  const east = controls.locator('[data-edgeless-resize-handle="e"]');
  await expect(east).toBeVisible();
  const initialHandle = (await east.boundingBox())!;
  const plate = today.locator(`[data-edgeless-group-hit="${id}"]`);
  const initialPlate = (await plate.boundingBox())!;
  const drag = controls.locator('.moveable-edgeDraggable[data-direction="w"]');
  const origin = (await drag.boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 4);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2 + 60, origin.y + origin.height / 4 + 30, { steps: 5 });
  await expect.poll(async () => (await east.boundingBox())!.x).toBeCloseTo(initialHandle.x + 60, 0);
  await expect.poll(async () => (await plate.boundingBox())!.x).toBeCloseTo(initialPlate.x + 60, 0);
  await expect.poll(async () => (await plate.boundingBox())!.y).toBeCloseTo(initialPlate.y + 30, 0);
  await page.keyboard.up("Alt");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await readChildren(page)).toEqual(before);
  const rotate = (await controls.locator('[data-edgeless-rotation-handle]').boundingBox())!;
  await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2);
  await page.mouse.down();
  await page.mouse.move(rotate.x + 100, rotate.y + 100, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await readChildren(page)).toEqual(before);
  await expect.poll(async () => (await east.boundingBox())!.x).toBeCloseTo(initialHandle.x, 0);
});

test("nested groups rotate HTML cards and connector endpoints, then ungroup without changing geometry", async ({ page }) => {
  const { today, id } = await openGroup(page);
  const outer = await page.evaluate((inner) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    editor.elements.updateElement("demo-review-element", { frame: { x: 520, y: 120, width: 300, height: 300 }, zIndex: 3000 });
    editor.elements.insertElement({ id: "group-link", type: "connector", frame: { x: 220, y: 160, width: 120, height: 20 }, zIndex: 3001, props: {
      source: { elementId: "group-a", anchor: { x: 1, y: 0.5 }, position: { x: 220, y: 170 } },
      target: { elementId: "group-b", anchor: { x: 0, y: 0.5 }, position: { x: 340, y: 170 } },
    } });
    editor.elements.insertElement({ id: "free-link", type: "connector", frame: { x: 340, y: 260, width: 120, height: 40 }, zIndex: 3001, props: {
      source: { anchor: { x: 0, y: 0 }, position: { x: 340, y: 260 } },
      target: { anchor: { x: 1, y: 1 }, position: { x: 460, y: 300 } },
    } });
    editor.elements.moveElements(["group-link", "free-link"], { parentId: inner });
    editor.commands.execute("edgeless.selection.set", [inner, "demo-review-element"]);
    return (editor.commands.execute("edgeless.selection.group") as EditorElementNode).id;
  }, id);
  const controls = today.locator(`[data-edgeless-controls-for="${outer}"]`);
  const rotation = controls.locator('[data-edgeless-rotation-handle]');
  await expect(rotation).toBeVisible();
  const before = await readChildren(page);
  await rotation.focus();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  const read = () => page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    return ["group-a", "group-b", "demo-review-element", "group-link", "free-link"].map(id => editor.elements.getElementNode(id)!);
  });
  await expect.poll(async () => Number((await read())[2]!.props.rotation)).toBeCloseTo(10);
  const after = await read();
  const source = after[3]!.props.source as { position: { x: number; y: number } };
  const a = after[0]!.frame;
  expect(source.position.x).toBeCloseTo(a.x + a.width / 2 + Math.cos(Math.PI / 18) * a.width / 2);
  expect(source.position.y).toBeCloseTo(a.y + a.height / 2 + Math.sin(Math.PI / 18) * a.width / 2);
  expect(after[0]!.frame).not.toEqual(before[0]!.frame);
  const freeSource = after[4]!.props.source as { position: { x: number; y: number } };
  // Compare the free endpoint with the same rigid rotation as the first child's center.
  const dx = 340 - 160;
  const dy = 260 - 170;
  expect(freeSource.position.x).toBeCloseTo(a.x + a.width / 2 + dx * Math.cos(Math.PI / 18) - dy * Math.sin(Math.PI / 18));
  expect(freeSource.position.y).toBeCloseTo(a.y + a.height / 2 + dx * Math.sin(Math.PI / 18) + dy * Math.cos(Math.PI / 18));
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.commands.execute("edgeless.selection.ungroup"));
  expect(await read()).toEqual(after);
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.undo());
  expect(await read()).toEqual(after);
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.undo());
  await expect.poll(() => readChildren(page)).toEqual(before);
});

for (const [initialAngle, repeat] of [[0, 0], [30, 0], [30, 200]] as const) {
  test(`continuous group rotation preserves distances and centers (${initialAngle}, ${repeat})`, async ({ page }) => {
    const { controls, today } = await openGroup(page, repeat);
    await page.evaluate(angle => (window as unknown as DemoWindow).__rivtoDemo.editor.elements.updateElement("group-b", { props: { rotation: angle } }), initialAngle);
    const children = today.locator('[data-edgeless-object-id="group-a"], [data-edgeless-object-id="group-b"]');
    const readCenters = () => children.evaluateAll(hosts => hosts.map(host => {
      const rect = host.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }));
    const before = await readChildren(page);
    const centers = await readCenters();
    expect(centers).toHaveLength(2);
    const distance = Math.hypot(centers[0]!.x - centers[1]!.x, centers[0]!.y - centers[1]!.y);
    const initialHandle = (await controls.locator('[data-edgeless-rotation-handle]').boundingBox())!;
    const plate = (await today.locator('[data-edgeless-group-hit]').boundingBox())!;
    const cx = plate.x + plate.width / 2;
    const cy = plate.y + plate.height / 2;
    const x = initialHandle.x + initialHandle.width / 2 - cx;
    const y = initialHandle.y + initialHandle.height / 2 - cy;
    await page.keyboard.down("Alt");
    await page.mouse.move(cx + x, cy + y);
    await page.mouse.down();
    for (let step = 1; step <= 12; step++) {
      const radians = step * Math.PI / 24;
      await page.mouse.move(cx + x * Math.cos(radians) - y * Math.sin(radians), cy + x * Math.sin(radians) + y * Math.cos(radians));
      const preview = await readCenters();
      expect(Math.hypot(preview[0]!.x - preview[1]!.x, preview[0]!.y - preview[1]!.y)).toBeCloseTo(distance, 1);
      if (initialAngle === 0) {
        expect((preview[0]!.x + preview[1]!.x) / 2).toBeCloseTo((centers[0]!.x + centers[1]!.x) / 2, 1);
        expect((preview[0]!.y + preview[1]!.y) / 2).toBeCloseTo((centers[0]!.y + centers[1]!.y) / 2, 1);
      }
      expect(await readChildren(page)).toEqual(before);
    }
    await page.mouse.up();
    await page.keyboard.up("Alt");
    const after = await readChildren(page);
    expect(Number(after[0]!.props.rotation)).toBeGreaterThan(80);
    expect(Number(after[1]!.props.rotation) - Number(after[0]!.props.rotation)).toBeCloseTo(initialAngle);
    expect(Math.hypot(after[0]!.frame.x - after[1]!.frame.x, after[0]!.frame.y - after[1]!.frame.y)).toBeCloseTo(distance, 1);
    const previewCenters = await readCenters();
    await today.getByRole("button", { name: "Page", exact: true }).click();
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    const remounted = await readCenters();
    remounted.forEach((point, index) => {
      expect(point.x).toBeCloseTo(previewCenters[index]!.x, 1);
      expect(point.y).toBeCloseTo(previewCenters[index]!.y, 1);
    });
    await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.undo());
    await expect.poll(() => readChildren(page)).toEqual(before);
  });
}

test("Moveable replaces the group outline and handle with themed controls", async ({ page }) => {
  const { controls, today } = await openGroup(page);
  await today.locator(".edgeless-viewport").evaluate(host => {
    (host as HTMLElement).style.setProperty("--rivto-accent", "rgb(120, 40, 180)");
    (host as HTMLElement).style.setProperty("--rivto-subtle", "rgb(240, 235, 250)");
  });
  await expect(today.locator(".edgeless-group-bound, [data-edgeless-group-bound-id]")).toHaveCount(0);
  await expect(today.locator('[data-edgeless-drag-handle]')).toHaveCount(0);
  const boundary = controls.locator(".moveable-line.moveable-direction:not(.moveable-edge)").first();
  await expect(boundary).toHaveCSS("border-top-style", "dashed");
  await expect(boundary).toHaveCSS("border-top-width", "2px");
  await expect(boundary).toHaveCSS("border-top-color", "rgb(120, 40, 180)");
  const point = controls.locator('[data-edgeless-resize-handle="e"]');
  await expect(point).toHaveCSS("background-color", "rgb(240, 235, 250)");
  await expect(point).toHaveCSS("border-top-color", "rgb(120, 40, 180)");
  const before = (await point.boundingBox())!;
  await today.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(async () => (await point.boundingBox())!.width).toBeCloseTo(before.width, 1);
});

test("group angle survives child movement and remount", async ({ page }) => {
  const { today, controls, id } = await openGroup(page);
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.elements.updateElement("group-b", { props: { rotation: 30 } }));
  await controls.locator('[data-edgeless-rotation-handle]').focus();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  const angle = () => page.evaluate(id => (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(id)!.props.rotation, id);
  await expect.poll(angle).toBeCloseTo(10);
  const plate = today.locator(`[data-edgeless-group-hit="${id}"]`);
  const before = await plate.boundingBox();
  await page.evaluate(() => {
    const e = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const child = e.elements.getElementNode("group-b")!;
    e.elements.updateElement(child.id, { frame: { x: child.frame.x + 80 } });
  });
  await expect.poll(async () => (await plate.boundingBox())!.width).toBeGreaterThan(before!.width + 60);
  const rotation = () => plate.evaluate(el => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return Math.atan2(m.b, m.a) * 180 / Math.PI;
  });
  await expect.poll(rotation).toBeCloseTo(10);
  await today.getByRole("button", { name: "Page", exact: true }).click();
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  await page.evaluate(id => (window as unknown as DemoWindow).__rivtoDemo.editor.commands.execute("edgeless.selection.set", [id]), id);
  await expect.poll(rotation).toBeCloseTo(10);
  await expect.poll(angle).toBeCloseTo(10);
});

for (const remaining of [1, 0]) {
  test(`group retains its angle with ${remaining} children`, async ({ page }) => {
    const { today, controls, id } = await openGroup(page);
    await page.evaluate(({ id, remaining }) => {
      const e = (window as unknown as DemoWindow).__rivtoDemo.editor;
      e.elements.updateElement(id, { props: { rotation: 35 } });
      e.elements.updateElement("group-a", { props: { rotation: 70 } });
      e.elements.removeElement("group-b");
      if (!remaining) e.elements.removeElement("group-a");
      e.commands.execute("edgeless.selection.set", [id]);
    }, { id, remaining });
    const east = controls.locator('[data-edgeless-resize-handle="e"]');
    const west = controls.locator('[data-edgeless-resize-handle="w"]');
    const angle = async () => {
      const a = (await east.boundingBox())!, b = (await west.boundingBox())!;
      return Math.atan2(a.y + a.height / 2 - b.y - b.height / 2, a.x + a.width / 2 - b.x - b.width / 2) * 180 / Math.PI;
    };
    await expect(east).toBeVisible();
    await expect.poll(angle).toBeCloseTo(35, 0);
    await controls.locator('[data-edgeless-rotation-handle]').focus();
    await page.keyboard.press("Alt+Shift+ArrowRight");
    await expect.poll(() => page.evaluate(id => (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(id)!.props.rotation, id)).toBeCloseTo(45);
    await expect.poll(angle).toBeCloseTo(45, 0);
    await expect(today.locator(`[data-edgeless-group-hit="${id}"]`)).toBeVisible();
  });
}

test("mixed-angle group returns to its original geometry and has only Moveable outlines", async ({ page }) => {
  const { today, controls, id } = await openGroup(page);
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.elements.updateElement("group-b", { props: { rotation: 30 } }));
  const before = await readChildren(page);
  const handle = controls.locator('[data-edgeless-rotation-handle]');
  await handle.focus(); await page.keyboard.press("Alt+Shift+ArrowRight");
  await handle.focus(); await page.keyboard.press("Alt+Shift+ArrowLeft");
  const after = await readChildren(page);
  after.forEach((child, index) => {
    const original = before[index]!;
    for (const field of ["x", "y", "width", "height"] as const) expect(child.frame[field]).toBeCloseTo(original.frame[field], 4);
    expect(Number(child.props.rotation)).toBeCloseTo(Number(original.props.rotation ?? 0));
  });
  await page.evaluate(id => (window as unknown as DemoWindow).__rivtoDemo.editor.commands.execute("edgeless.selection.set", [id]), "group-a");
  await expect(today.locator('[data-edgeless-object-id="group-a"]')).toHaveCSS("outline-style", "none");
  await expect(today.locator('[data-edgeless-controls-for="group-a"]')).toBeVisible();
  expect(await page.evaluate(id => (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(id)!.props.rotation, id)).toBeCloseTo(0);
});

test("moving a child updates its rotated group without moving its sibling", async ({ page }) => {
  const { today, controls, id } = await openGroup(page);
  await controls.locator('[data-edgeless-rotation-handle]').focus();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  const before = await readChildren(page);
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.commands.execute("edgeless.selection.set", ["group-b"]));
  const edge = today.locator('[data-edgeless-controls-for="group-b"] .moveable-edgeDraggable[data-direction="w"]');
  const rect = (await edge.boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 4);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 70, rect.y + rect.height / 4 + 20, { steps: 8 });
  await page.mouse.up(); await page.keyboard.up("Alt");
  const after = await readChildren(page);
  expect(after[0]).toEqual(before[0]);
  expect(after[1].frame.x).toBeCloseTo(before[1].frame.x + 70);
  expect(after[1].frame.y).toBeCloseTo(before[1].frame.y + 20);
  await page.evaluate(id => (window as unknown as DemoWindow).__rivtoDemo.editor.commands.execute("edgeless.selection.set", [id]), id);
  const e = (await controls.locator('[data-edgeless-resize-handle="e"]').boundingBox())!;
  const w = (await controls.locator('[data-edgeless-resize-handle="w"]').boundingBox())!;
  expect(Math.atan2(e.y - w.y, e.x - w.x) * 180 / Math.PI).toBeCloseTo(10, 0);
});

for (const route of ["straight", "orthogonal", "curve"] as const) {
  for (const cancel of [true, false]) {
    test(`group rotation keeps connector targets and bounds aligned during ${route} preview (${cancel ? "cancel" : "commit"})`, async ({ page }) => {
      const { today, id, controls } = await openGroup(page);
      await page.evaluate(({ id, route }) => {
        const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
        editor.elements.insertElement({ id: "rotation-link", type: "connector",
          frame: { x: 220, y: 170, width: 120, height: 1 }, zIndex: 3001, props: {
            route,
            source: { elementId: "group-a", anchor: { x: 1, y: 0.5 }, position: { x: 220, y: 170 } },
            target: { elementId: "group-b", anchor: { x: 0, y: 0.5 }, position: { x: 340, y: 170 } },
          } }, { parentId: id });
      }, { id, route });
      const plate = today.locator(`[data-edgeless-group-hit="${id}"]`);
      const connector = today.locator('[data-edgeless-object-id="rotation-link"]');
      const readSize = () => plate.evaluate(host => ({ width: parseFloat(host.style.width), height: parseFloat(host.style.height) }));
      const readLines = () => controls.locator('.moveable-line.moveable-direction:not(.moveable-edge)')
        .evaluateAll(hosts => hosts.map(host => parseFloat((host as HTMLElement).style.width)));
      await expect(controls.locator('[data-edgeless-rotation-handle]')).toBeVisible();
      const size = await readSize();
      const lines = await readLines();
      const before = await readChildren(page);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const box = (await plate.boundingBox())!;
      const handle = (await controls.locator('[data-edgeless-rotation-handle]').boundingBox())!;
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const x = handle.x + handle.width / 2 - cx, y = handle.y + handle.height / 2 - cy;
      await page.keyboard.down("Alt");
      await page.mouse.move(cx + x, cy + y); await page.mouse.down();
      for (let step = 1; step <= 6; step++) {
        const angle = step * Math.PI / 12;
        await page.mouse.move(cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle));
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const preview = await readSize();
        expect(preview.width).toBeCloseTo(size.width, 1);
        expect(preview.height).toBeCloseTo(size.height, 1);
        (await readLines()).forEach((length, index) => expect(length).toBeCloseTo(lines[index]!, 1));
        expect(await readChildren(page)).toEqual(before);
      }
      await page.keyboard.up("Alt");
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(connector).not.toHaveAttribute("data-edgeless-geometry-lock");
      await expect(connector).toHaveCSS("visibility", "visible");
      await expect(connector).toHaveCSS("transform", "none");
      if (cancel) expect(await readChildren(page)).toEqual(before);
      else expect(Number((await readChildren(page))[0].props.rotation)).toBeCloseTo(90, 0);
      if (!cancel) {
        await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.undo());
        await expect.poll(() => readChildren(page)).toEqual(before);
      }
    });
  }
}
