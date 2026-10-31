import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test("opens a readable notebook with matching canvas cards", async ({ page }) => {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.getByRole("heading", { name: "A weekend outdoors" })).toBeVisible();
  await expect(today.getByRole("heading", { name: "Lunch on the grass" })).toBeVisible();
  await expect(today.getByRole("heading", { name: "Games for a quiet evening" })).toBeVisible();
  await expect(today.getByRole("heading", { name: "What to bring" })).toBeVisible();
  await expect(today.getByRole("heading", { name: "A little something sweet" })).toBeVisible();
  await expect(today.getByRole("heading", { name: "A few ideas" })).toBeVisible();
  await expect(today.locator('[data-block-type="separator"]')).toHaveCount(2);
  await expect(today.getByRole("button", { name: /Status: doing/ })).toHaveCount(1);
  await expect(today.locator('[data-block-type="bento"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Edgeless", exact: true }).click();
  await expect(today.getByRole("heading", { name: "A weekend outdoors" })).toBeVisible();
  await expect(today.getByText("If it rains", { exact: true })).toBeVisible();
  await expect(today.getByText("Nature center", { exact: false }).first()).toBeVisible();
  await expect(
    today.locator('[data-edgeless-visual-kind="sticker"]').filter({ hasText: "Bring binoculars" }),
  ).toBeVisible();
  await expect(today.getByText("Birdwatching", { exact: false }).first()).toBeVisible();
});

test("shows notes and pencil sketches beside the document cards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edgeless", exact: true }).click();
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.getByText("A quiet morning companion", { exact: true })).toBeVisible();
  await expect(today.locator('[data-edgeless-visual-kind="drawing"]')).toHaveCount(18);
  await expect(today.locator(".edgeless-drawing-stroke").first()).toHaveAttribute("d", /.+/);
  await today.locator(".edgeless-viewport").hover({ position: { x: 600, y: 100 } });
  await page.mouse.wheel(770, 0);
  await expect(today.getByText("Ready for a walk", { exact: true })).toBeVisible();
  await expect(today.getByText("Save a shady spot", { exact: false })).toBeVisible();
});

for (const [index, animal] of ["cat", "dog"].entries()) {
  test(`moves the ${animal} sketch as a group`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/");
    const groups = await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.elements
        .getElementNodes()
        .filter((element) => element.type === "group")
        .map((element) => ({ id: element.id, children: element.childIds })),
    );
    expect(groups.map((group) => group.children.length)).toEqual([10, 8]);
    const group = groups[index];
    const readFrames = () =>
      page.evaluate((ids) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return ids.map((id) => editor.elements.getElementNode(id)!.frame);
      }, group.children);
    const before = await readFrames();
    await page.getByRole("button", { name: "Edgeless", exact: true }).click();
    const today = page.locator('[data-journal-document="today"]');
    if (index === 1) {
      await today.locator(".edgeless-viewport").hover({ position: { x: 600, y: 100 } });
      await page.mouse.wheel(770, 0);
    }
    const ink = today.locator(
      `[data-edgeless-object-id="${group.children[0]}"] .edgeless-drawing-stroke`,
    );
    const point = await ink.evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path.getPointAtLength(path.getTotalLength() / 4);
      const screen = point.matrixTransform(path.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    });
    await page.mouse.click(point.x, point.y);
    const edge = today.locator(
      `[data-edgeless-controls-for="${group.id}"] .moveable-edgeDraggable[data-direction="w"]`,
    );
    const box = (await edge.boundingBox())!;
    await page.keyboard.down("Alt");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 4 + 20, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect.poll(async () => (await readFrames())[0].x).toBeCloseTo(before[0].x + 35, 0);
    const after = await readFrames();
    for (const [childIndex, frame] of after.entries()) {
      expect(frame.x).toBeCloseTo(before[childIndex].x + 35, 0);
      expect(frame.y).toBeCloseTo(before[childIndex].y + 20, 0);
    }
  });
}

test("keeps the original showcase behind the explicit flag", async ({ page }) => {
  await page.goto("/?test_features=1");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.getByText("Rivto editor", { exact: true }).first()).toBeVisible();
  await expect(today.locator('[data-block-type="demo.counter"]')).toHaveCount(1);
  await expect(today.locator('[data-block-type="kanban"]')).toHaveCount(1);
  await expect(today.getByRole("heading", { name: "A weekend outdoors" })).toHaveCount(0);
});

test("keeps the weekend plan connected when a stage moves", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edgeless", exact: true }).click();
  const today = page.locator('[data-journal-document="today"]');
  const stage = today.locator('[data-edgeless-visual-kind="rectangle"]').first();
  const connector = today.locator('[data-edgeless-visual-kind="connector"]').first();
  const branch = today.locator('[data-edgeless-visual-kind="connector"]').nth(2);
  const before = await connector.evaluate((element) => (element as HTMLElement).style.cssText);
  const branchBefore = await branch.evaluate((element) => (element as HTMLElement).style.cssText);
  const box = (await stage.boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect
    .poll(() => connector.evaluate((element) => (element as HTMLElement).style.cssText))
    .not.toBe(before);
  await expect
    .poll(() => branch.evaluate((element) => (element as HTMLElement).style.cssText))
    .not.toBe(branchBefore);
});

test("shows the picnic preparation diagram when panning across the canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Edgeless", exact: true }).click();
  const today = page.locator('[data-journal-document="today"]');
  await today.locator(".edgeless-viewport").hover({ position: { x: 600, y: 100 } });
  await page.mouse.wheel(1100, 0);
  await expect(today.getByText("Picnic preparation", { exact: true })).toBeVisible();
  await expect(
    today
      .locator('[data-edgeless-visual-kind="rectangle"]')
      .filter({ hasText: "Roast vegetables" }),
  ).toBeVisible();
  await expect(
    today.locator('[data-edgeless-visual-kind="ellipse"]').filter({ hasText: "Add berries" }),
  ).toBeVisible();
});

test("repeats the notebook section without selecting the feature showcase", async ({ page }) => {
  await page.goto("/?repeat=2");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.getByRole("heading", { name: "Games for a quiet evening" })).toHaveCount(3);
  await expect(today.locator('[data-block-type="separator"]')).toHaveCount(4);
  await expect(today.locator('[data-block-type="demo.counter"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Edgeless", exact: true }).click();
  const frames = await page.evaluate(() =>
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.elements
      .getElementNodes()
      .filter((element) => element.type === "block")
      .map((element) => element.frame),
  );
  expect(frames).toHaveLength(5);
  expect(frames[3].x).toBeGreaterThan(frames[0].x + frames[0].width);
});
