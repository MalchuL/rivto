import { expect, test } from "@playwright/test";

test("independent canvas virtualizes 10,000 elements and pans without losing world geometry", async ({
  page,
}) => {
  await page.goto("/");
  const viewport = page.getByRole("main", { name: "Independent canvas" });
  const items = viewport.locator("[data-canvas-element]");
  await expect(items.first()).toBeVisible();
  const before = await items.count();
  expect(before).toBeLessThan(100);
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 700, box.y + 250);
  await page.mouse.wheel(2200, 1800);
  await expect(viewport.locator('[data-canvas-element="0"]')).toHaveCount(0);
  await expect(viewport.locator('[data-canvas-element="1010"]')).toBeVisible();
  expect(await items.count()).toBeLessThan(100);
  await expect(page.getByLabel("Committed gestures")).toHaveText("0");
});

test("independent canvas commits a drag once and cancels the next gesture", async ({ page }) => {
  await page.goto("/");
  const item = page.locator('[data-canvas-element="0"]');
  const initial = (await item.boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(initial.x + 50, initial.y + 40);
  await page.mouse.down();
  await page.mouse.move(initial.x + 130, initial.y + 90, { steps: 5 });
  await expect(page.getByLabel("Committed gestures")).toHaveText("0");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
  const committed = (await item.boundingBox())!;
  expect(committed.x - initial.x).toBeCloseTo(80, 0);
  await page.mouse.move(committed.x + 50, committed.y + 40);
  await page.mouse.down();
  await page.mouse.move(committed.x + 180, committed.y + 100, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await item.boundingBox())!.x).toBeCloseTo(committed.x, 0);
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
});

test("independent canvas resizes and rotates through shared accessible controls", async ({
  page,
}) => {
  await page.goto("/");
  const item = page.locator('[data-canvas-element="0"]');
  await item.click();
  const before = (await item.boundingBox())!;
  const handle = page.getByRole("button", { name: "Resize se", exact: true });
  await expect(handle).toBeVisible();
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
  expect((await item.boundingBox())!.width).toBeGreaterThan(before.width);
  await page.getByRole("button", { name: "Rotate element", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Committed gestures")).toHaveText("2");
});

test("independent canvas keeps a focused offscreen element mounted until focus leaves", async ({
  page,
}) => {
  await page.goto("/");
  const viewport = page.getByRole("main", { name: "Independent canvas" });
  const first = page.locator('[data-canvas-element="0"]');
  await first.focus();
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 700, box.y + 250);
  await page.mouse.wheel(3000, 3000);
  await expect(first).toHaveCount(1);
  await expect(first).toBeFocused();
  await viewport.focus();
  await expect(first).toHaveCount(0);
});

test("resizes a selection with an offscreen member without mounting its content just for selection", async ({
  page,
}) => {
  await page.goto("/");
  const viewport = page.getByRole("main", { name: "Independent canvas" });
  const first = page.locator('[data-canvas-element="0"]');
  await first.click();
  const before = await first.evaluate((node) => parseFloat((node as HTMLElement).style.width));
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 700, box.y + 250);
  await page.mouse.wheel(2200, 1800);
  await expect(first).toHaveCount(0);
  await page.locator('[data-canvas-element="1010"]').click({ modifiers: ["Control"] });
  await expect(first).toHaveCount(0);
  await page.getByRole("button", { name: "Resize se", exact: true }).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
  await page.mouse.move(box.x + 700, box.y + 250);
  await page.mouse.wheel(-2200, -1800);
  await expect(first).toHaveCount(1);
  expect(
    await first.evaluate((node) => parseFloat((node as HTMLElement).style.width)),
  ).toBeGreaterThan(before);
});

for (const zoom of [false, true]) {
  for (const direction of ["n", "e", "s", "w", "ne", "nw", "se", "sw"]) {
    test(`independent pointer resize ${direction} zoom=${zoom} follows every sample and commits the preview`, async ({
      page,
    }) => {
      await page.goto("/");
      const item = page.locator('[data-canvas-element="0"]');
      await item.click();
      if (zoom) {
        const viewport = (await page
          .getByRole("main", { name: "Independent canvas" })
          .boundingBox())!;
        await page.mouse.move(viewport.x + 5, viewport.y + 5);
        await page.keyboard.down("Control");
        await page.mouse.wheel(0, -Math.log(2) / 0.006);
        await page.keyboard.up("Control");
        await expect.poll(async () => (await item.boundingBox())!.width).toBeGreaterThan(290);
      }
      await page.keyboard.down("Alt");
      const before = (await item.boundingBox())!;
      const handle = page.getByRole("button", { name: `Resize ${direction}`, exact: true });
      const box = (await handle.boundingBox())!;
      const dx = Number(direction.includes("e")) - Number(direction.includes("w"));
      const dy = Number(direction.includes("s")) - Number(direction.includes("n"));
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (const delta of [10, 20, 30]) {
        await page.mouse.move(
          box.x + box.width / 2 + dx * delta,
          box.y + box.height / 2 + dy * delta,
        );
        await expect
          .poll(async () => {
            const preview = (await item.boundingBox())!;
            return (
              Math.abs(preview.width - before.width - Math.abs(dx) * delta) +
              Math.abs(preview.height - before.height - Math.abs(dy) * delta)
            );
          })
          .toBeLessThan(1.1);
        const preview = (await item.boundingBox())!;
        expect(
          Math.abs(
            preview.x + (dx < 0 ? preview.width : 0) - before.x - (dx < 0 ? before.width : 0),
          ),
        ).toBeLessThan(1);
        expect(
          Math.abs(
            preview.y + (dy < 0 ? preview.height : 0) - before.y - (dy < 0 ? before.height : 0),
          ),
        ).toBeLessThan(1);
        await expect(page.getByLabel("Committed gestures")).toHaveText("0");
      }
      const preview = await item.boundingBox();
      await page.mouse.up();
      await page.keyboard.up("Alt");
      await expect(page.getByLabel("Committed gestures")).toHaveText("1");
      expect(await item.boundingBox()).toEqual(preview);
    });
  }
}

test("independent rotated resize cancels back to the committed geometry", async ({ page }) => {
  await page.goto("/");
  const item = page.locator('[data-canvas-element="101"]');
  await item.click();
  await page.keyboard.down("Alt");
  await page.keyboard.down("Shift");
  const before = (await item.boundingBox())!;
  const rotation = (await page
    .getByRole("button", { name: "Rotate element", exact: true })
    .boundingBox())!;
  const center = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  const radius = center.y - rotation.y - rotation.height / 2;
  await page.mouse.move(rotation.x + rotation.width / 2, rotation.y + rotation.height / 2);
  await page.mouse.down();
  await page.mouse.move(center.x + radius, center.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
  const rotated = (await item.boundingBox())!;
  expect(rotated.width).toBeCloseTo(before.height, 0);
  expect(rotated.height).toBeCloseTo(before.width, 0);
  const handle = (await page.getByRole("button", { name: "Resize e", exact: true }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 30, {
    steps: 4,
  });
  await expect
    .poll(async () => (await item.boundingBox())!.height)
    .toBeCloseTo(rotated.height + 30, 0);
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  expect(await item.boundingBox()).toEqual(rotated);
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
});

test("pointer cancellation restores a default transform without committing", async ({ page }) => {
  await page.goto("/");
  const element = page.locator('[data-canvas-element="0"]');
  await element.click();
  const original = (await element.boundingBox())!;
  await page.mouse.move(original.x + 70, original.y + 40);
  const pointer = page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        window.addEventListener("pointerdown", (event) => resolve(event.pointerId), {
          once: true,
          capture: true,
        });
      }),
  );
  await page.mouse.down();
  const pointerId = await pointer;
  await page.mouse.move(original.x + 170, original.y + 100, { steps: 4 });
  const preview = (await element.boundingBox())!;
  expect(preview.x).not.toBe(original.x);
  await page.evaluate((id) => {
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: id + 999 }));
  }, pointerId);
  expect(await element.boundingBox()).toEqual(preview);
  await page.evaluate((id) => {
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: id }));
  }, pointerId);
  await expect.poll(() => element.boundingBox()).toEqual(original);
  await page.mouse.up();
  await expect(page.getByLabel("Committed gestures")).toHaveText("0");
});

test("transform control identity follows selection clearing", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-canvas-element="0"]').click();
  await expect(page.locator('[data-canvas-controls-for="0"]')).toHaveCount(1);
  await page.locator('[data-canvas-element="0"]').click({ modifiers: ["Control"] });
  await expect(page.locator("[data-canvas-controls-for]")).toHaveCount(0);
});

test("view attachment follows hide and remount without replacing the editor scene", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Canvas attachment")).toHaveText("mounted");
  const item = page.locator('[data-canvas-element="0"]');
  await item.click();
  await page.getByRole("button", { name: "Resize se", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  const width = await item.evaluate((node) => (node as HTMLElement).style.width);
  const committed = (await item.boundingBox())!;
  await page.mouse.move(committed.x + 40, committed.y + 40);
  await page.mouse.down();
  await page.mouse.move(committed.x + 140, committed.y + 80, { steps: 3 });
  // Consume Moveable's post-drag click guard before simulating host-driven unmount.
  await page.getByRole("main", { name: "Independent canvas" }).dispatchEvent("click");
  await page.getByRole("button", { name: "Hide canvas", exact: true }).evaluate((button) => {
    if (!(button instanceof HTMLElement)) {
      throw new Error("Expected an HTML button");
    }
    button.click();
  });
  await page.mouse.up();
  await expect(page.getByLabel("Canvas attachment")).toHaveText("detached");
  await expect(item).toHaveCount(0);
  await page.getByRole("button", { name: "Show canvas", exact: true }).click();
  await expect(page.getByLabel("Canvas attachment")).toHaveText("mounted");
  await expect(item).toBeVisible();
  expect(await item.boundingBox()).toEqual(committed);
  expect(await item.evaluate((node) => (node as HTMLElement).style.width)).toBe(width);
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
});

test("rotation remains available when movement and resize are disabled", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("checkbox", { name: "movable", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "resizable", exact: true }).uncheck();
  const item = page.locator('[data-canvas-element="0"]');
  await item.click();
  await expect(page.getByRole("button", { name: "Resize se", exact: true })).toHaveCount(0);
  await expect(page.locator(".moveable-edgeDraggable")).toHaveCount(0);
  const rotate = page.getByRole("button", { name: "Rotate element", exact: true });
  await expect(rotate).toBeVisible();
  const before = await item.getAttribute("style");
  await rotate.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
  expect(await item.getAttribute("style")).not.toBe(before);
  await page.getByRole("checkbox", { name: "resizable", exact: true }).check();
  await expect(page.getByRole("button", { name: "Resize se", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "rotatable", exact: true }).uncheck();
  await expect(rotate).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resize se", exact: true })).toBeVisible();
});

test("default dragging rejects a selection containing an immovable member", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("checkbox", { name: "movable", exact: true }).uncheck();
  const first = page.locator('[data-canvas-element="0"]');
  const second = page.locator('[data-canvas-element="1"]');
  await first.click();
  await second.click({ modifiers: ["Control"] });
  const firstFrame = (await first.boundingBox())!;
  const secondFrame = (await second.boundingBox())!;
  await page.mouse.move(secondFrame.x + 50, secondFrame.y + 40);
  await page.mouse.down();
  await page.mouse.move(secondFrame.x + 130, secondFrame.y + 80, { steps: 3 });
  expect(await first.boundingBox()).toEqual(firstFrame);
  expect(await second.boundingBox()).toEqual(secondFrame);
  await page.mouse.up();
  await expect(page.getByLabel("Committed gestures")).toHaveText("0");
});
