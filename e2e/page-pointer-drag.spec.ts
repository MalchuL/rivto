import { returnToDocumentAfterNativeHandleClick } from "./drag-handle-navigation";
import { blockDropRegion } from "./drop-regions";
import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const { cancel, capture } of [
  { cancel: false, capture: false },
  { cancel: true, capture: false },
  { cancel: false, capture: true },
  { cancel: true, capture: true },
]) {
  test(`Page pointer owner ${cancel ? "cancels with Escape" : "commits one undoable root move"}, capture=${capture}`, async ({
    page,
  }) => {
    await page.goto("/");
    const surface = page.locator('[data-journal-document="today"] > .page-surface');
    await expect(surface).toBeVisible();
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      for (const id of ["drag-one", "drag-two", "drag-three"]) {
        editor.blocks.insertBlock({ id, type: "paragraph", content: id });
      }
      editor.history.clear();
    });
    const source = surface.locator('[data-block-id="drag-one"]');
    await source.locator(":scope > .rivto-block-row").hover();
    const handle = source.locator(".block-handle");
    await expect(handle).toHaveCSS("pointer-events", "auto");
    if (capture) {
      await handle.evaluate((element) => {
        element.addEventListener("pointerdown", (event) => {
          element.setPointerCapture((event as PointerEvent).pointerId);
        });
      });
    }
    const from = (await handle.boundingBox())!;
    const target = (await (
      await blockDropRegion(surface.locator('[data-block-id="drag-three"]'), "after")
    ).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await expect(surface.locator(".rivto-block-drag-preview")).toBeVisible();
    await expect(source).toHaveCSS("opacity", "0.45");
    await expect(surface.locator(".rivto-block-drag-preview")).toContainText("drag-one");
    await expect(surface.locator(".rivto-block-drag-preview [contenteditable]")).toHaveCount(0);
    if (cancel) {
      await page.keyboard.press("Escape");
    }
    await page.mouse.up();
    const navigated = await returnToDocumentAfterNativeHandleClick(page, "drag-one");
    if (navigated) {
      await surface.focus();
    }
    await expect(surface.locator(".rivto-block-drag-preview")).toHaveCount(0);
    await expect(source).toHaveCSS("opacity", "1");
    const roots = await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getRootIds(),
    );
    expect(roots).toEqual(
      cancel ? ["drag-one", "drag-two", "drag-three"] : ["drag-two", "drag-three", "drag-one"],
    );
    if (!cancel) {
      await expect(surface).toBeFocused();
      await page.keyboard.press("Control+z");
      await expect(
        surface
          .locator(":scope > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id]")
          .first(),
      ).toHaveAttribute("data-block-id", "drag-one");
    }
  });
}

for (const depth of [0, 1, 2]) {
  test(`Page pointer gap selects ancestor depth ${depth}`, async ({ page }) => {
    await page.goto("/");
    const surface = page.locator('[data-journal-document="today"] > .page-surface');
    await expect(surface).toBeVisible();
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      editor.blocks.insertBlock({ id: "moving", type: "paragraph", content: "Moving" });
      editor.blocks.insertBlock({
        id: "parent",
        type: "paragraph",
        content: "Parent",
        children: [
          {
            id: "branch",
            type: "paragraph",
            content: "Branch",
            children: [{ id: "leaf", type: "paragraph", content: "Leaf" }],
          },
        ],
      });
      editor.blocks.insertBlock({ id: "following", type: "paragraph", content: "Following" });
      editor.history.clear();
    });
    const source = surface.locator('[data-block-id="moving"]');
    await source.locator(":scope > .rivto-block-row").hover();
    const from = (await source.locator(".block-handle").boundingBox())!;
    const anchor = surface.locator(`[data-block-id="${["leaf", "branch", "parent"][depth]}"]`);
    const region = (await anchor.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(region.x + 3, region.y + region.height - 3, { steps: 10 });
    await expect(surface.locator(".rivto-block-drag-preview")).toBeVisible();
    const line = surface.locator(".rivto-block-drop-line");
    await expect(line).toBeVisible();
    const indicator = (await line.boundingBox())!;
    expect(indicator.x).toBeCloseTo(region.x, 0);
    let boundaryY = region.y + region.height;
    if (depth === 2) {
      const following = (await surface.locator('[data-block-id="following"]').boundingBox())!;
      // Root siblings share a boundary; terminal nested levels have only one anchor.
      boundaryY = (boundaryY + following.y) / 2;
    }
    expect(indicator.y + indicator.height / 2).toBeCloseTo(boundaryY, 0);
    expect(indicator.height).toBe(4);
    await page.mouse.up();
    const parent = await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getParentId("moving"),
    );
    expect(parent ?? null).toBe(["branch", "parent", null][depth]);
    await expect(line).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(
      surface
        .locator(":scope > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id]")
        .first(),
    ).toHaveAttribute("data-block-id", "moving");
  });
}

test("Page pointer uses the intermediate root gap instead of appending to the page", async ({
  page,
}) => {
  await page.goto("/");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await expect(surface).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    for (const id of ["gap-one", "gap-two", "gap-three"]) {
      editor.blocks.insertBlock({ id, type: "paragraph", content: id });
    }
  });
  await surface.evaluate((element) => {
    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.style.rowGap = "12px";
  });
  const source = surface.locator('[data-block-id="gap-three"]');
  await source.locator(":scope > .rivto-block-row").hover();
  const from = (await source.locator(".block-handle").boundingBox())!;
  const first = (await surface.locator('[data-block-id="gap-one"]').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 2, first.y + first.height + 6, { steps: 10 });
  await expect(surface.locator(".rivto-block-drag-preview")).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(() =>
      surface
        .locator(":scope > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id]")
        .evaluateAll((blocks) => blocks.map((block) => block.getAttribute("data-block-id"))),
    )
    .toEqual(["gap-one", "gap-three", "gap-two"]);
});

test("Page pointer scrolls a nested container and releases its frame on Escape", async ({
  page,
}) => {
  await page.goto("/");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await expect(surface).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.history.batchUpdates(() => {
      for (let index = 0; index < 100; index += 1) {
        editor.blocks.insertBlock({
          id: `scroll-${index}`,
          type: "paragraph",
          content: `Row ${index}`,
        });
      }
    });
  });
  await surface.evaluate((element) => {
    Object.assign(element.style, { height: "220px", minHeight: "0", overflowY: "auto" });
  });
  const source = surface.locator('[data-block-id="scroll-0"]');
  await source.locator(":scope > .rivto-block-row").hover();
  const from = (await source.locator(".block-handle").boundingBox())!;
  const box = (await surface.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3, { steps: 8 });
  await expect.poll(() => surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(surface.locator(".rivto-block-drag-preview")).toHaveCount(0);
  const top = await surface.evaluate((element) => element.scrollTop);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await surface.evaluate((element) => element.scrollTop)).toBe(top);
});

test("Page preview caps a large subtree and skips collapsed descendants", async ({ page }) => {
  await page.goto("/");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await expect(surface).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({ id: "target", type: "paragraph", content: "Target" });
    editor.blocks.insertBlock({
      id: "source",
      type: "paragraph",
      content: "Source",
      children: [
        {
          type: "paragraph",
          content: "<em>Closed</em>",
          listProps: { collapsed: true },
          children: [{ type: "paragraph", content: "Hidden descendant" }],
        },
        ...Array.from({ length: 200 }, (_, index) => ({
          type: "paragraph",
          content: `Child ${index}`,
        })),
      ],
    });
  });
  const source = surface.locator('[data-block-id="source"]');
  await source.locator(":scope > .rivto-block-row").hover();
  const from = (await source.locator(":scope > .rivto-block-row .block-handle").boundingBox())!;
  const to = (await surface.locator('[data-block-id="target"] > .rivto-block-row').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 2, to.y + 1, { steps: 8 });
  const preview = surface.locator(".rivto-block-drag-preview");
  await expect(preview.locator(".rivto-block-drag-preview-row")).toHaveText([
    "Source",
    "<em>Closed</em>",
    "Child 0",
    "Child 1",
  ]);
  await expect(preview.locator("em, [contenteditable], [data-block-id]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(
    surface
      .locator(":scope > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id]")
      .first(),
  ).toHaveAttribute("data-block-id", "target");
});

test("Page cancels a drag when the primary button is released outside the viewport", async ({
  page,
}) => {
  await page.goto("/");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  const source = surface
    .locator(":scope > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id]")
    .first();
  await source.locator(":scope > .rivto-block-row").hover();
  const from = (await source.locator(".block-handle").boundingBox())!;
  const roots = await page.evaluate(() =>
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.blocks.getRootIds(),
  );
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width + 40, from.y + from.height / 2);
  await expect(surface.locator(".rivto-block-drag-preview")).toBeVisible();
  await expect(source).toHaveCSS("opacity", "0.45");
  await page.mouse.move(from.x + from.width + 40, page.viewportSize()!.height + 100);
  await page.mouse.up();
  await page.mouse.move(10, 10);
  await expect(surface.locator(".rivto-block-drag-preview")).toHaveCount(0);
  await expect(source).not.toHaveAttribute("data-dragging");
  await expect(source).toHaveCSS("opacity", "1");
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getRootIds(),
    ),
  ).toEqual(roots);
});
