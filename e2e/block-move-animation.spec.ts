import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { blockDropRegion } from "./drop-regions";

test("moves a nested subtree together when indenting", async ({ page }) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const { editor } = (
      window as unknown as {
        __rivtoDemo: {
          editor: DocumentEditorAPI;
        };
      }
    ).__rivtoDemo;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({ id: "tree-parent", type: "paragraph", content: "Parent" });
    editor.blocks.insertBlock({
      id: "tree-root",
      type: "paragraph",
      content: "Root",
      children: [{ id: "tree-child", type: "paragraph", content: "Child" }],
    });
  });
  const root = surface.locator('[data-block-id="tree-root"]');
  await root.locator(":scope > .rivto-block-row [data-block-content]").click();
  await page.keyboard.press("Tab");
  await expect(
    surface.locator(
      '[data-block-id="tree-parent"] > .rivto-block-children > [data-block-id="tree-root"]',
    ),
  ).toHaveCount(1);
  expect(await root.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect(root.locator('[data-block-id="tree-child"]')).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(
    surface.locator('[data-virtual-block-id="tree-root"] > [data-block-id="tree-root"]'),
  ).toHaveCount(1);
  expect(await root.evaluate((element) => element.getAnimations().length)).toBe(0);
});

test("animates a dropped block after its document order changes", async ({ page }) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const runtime = window as unknown as {
      __rivtoDemo: {
        editor: DocumentEditorAPI;
      };
    };
    const editor = runtime.__rivtoDemo.editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "move-one",
      type: "paragraph",
      content: "move-one",
      children: [{ id: "move-nested", type: "paragraph", content: "Nested" }],
    });
    for (const id of ["move-two", "move-three"]) {
      editor.blocks.insertBlock({ id, type: "paragraph", content: id });
    }
  });
  const source = surface.locator('[data-block-id="move-one"]');
  await source.locator(":scope > .rivto-block-row").hover();
  const handle = source.locator(":scope > .rivto-block-row .block-handle");
  const from = (await handle.boundingBox())!;
  const target = (await (
    await blockDropRegion(surface.locator('[data-block-id="move-three"]'), "after")
  ).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getRootIds(),
      ),
    )
    .toEqual(["move-two", "move-three", "move-one"]);
  await expect
    .poll(() => source.evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
  const frames = await source.evaluate((element) =>
    element
      .getAnimations()
      .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes()),
  );
  expect(frames.some((frame) => "opacity" in frame)).toBe(false);
  expect(frames.map((frame) => frame.transform)).toEqual([
    "translateX(-6px)",
    "translateX(0px)",
    "translateX(3px)",
    "translateX(0px)",
  ]);
  expect(
    await source.evaluate((element) => element.getAnimations()[0]?.effect?.getTiming().duration),
  ).toBe(150);
  await expect(source.locator('[data-block-id="move-nested"]')).toBeVisible();
});

test("restarts the jiggle when the same block is dropped again", async ({ page }) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const { editor } = (
      window as unknown as {
        __rivtoDemo: {
          editor: DocumentEditorAPI;
        };
      }
    ).__rivtoDemo;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    for (const id of ["repeat-one", "repeat-two", "repeat-three"]) {
      editor.blocks.insertBlock({ id, type: "paragraph", content: id });
    }
  });
  const source = surface.locator('[data-block-id="repeat-one"]');
  for (const [targetId, placement, order] of [
    ["repeat-three", "after", ["repeat-two", "repeat-three", "repeat-one"]],
    ["repeat-two", "before", ["repeat-one", "repeat-two", "repeat-three"]],
  ] as const) {
    await source.locator(":scope > .rivto-block-row").hover();
    const handle = (await source.locator(":scope > .rivto-block-row .block-handle").boundingBox())!;
    const target = (await (
      await blockDropRegion(surface.locator(`[data-block-id="${targetId}"]`), placement)
    ).boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as {
              __rivtoDemo: { editor: DocumentEditorAPI };
            }
          ).__rivtoDemo.editor.blocks.getRootIds(),
        ),
      )
      .toEqual(order);
    await expect
      .poll(() =>
        source.evaluate((element) =>
          element.getAnimations().some((animation) => animation.playState === "running"),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        source.evaluate((element) =>
          element.getAnimations().some((animation) => animation.playState === "running"),
        ),
      )
      .toBe(false);
    await expect(source).toHaveCSS("transform", "none");
  }
});

test("jiggles a block dropped into another block without fading", async ({ page }) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const runtime = window as unknown as {
      __rivtoDemo: {
        editor: DocumentEditorAPI;
      };
    };
    const editor = runtime.__rivtoDemo.editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    for (const id of ["drop-child", "drop-parent"]) {
      editor.blocks.insertBlock({ id, type: "paragraph", content: id });
    }
  });
  const source = surface.locator('[data-block-id="drop-child"]');
  await source.locator(":scope > .rivto-block-row").hover();
  const from = (await source.locator(".block-handle").boundingBox())!;
  const target = (await (
    await blockDropRegion(surface.locator('[data-block-id="drop-parent"]'), "inside")
  ).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getParentId("drop-child"),
      ),
    )
    .toBe("drop-parent");
  const row = source.locator(":scope > .rivto-block-row");
  expect(
    await row.evaluate((element) =>
      element
        .getAnimations()
        .some((animation) =>
          (animation.effect as KeyframeEffect).getKeyframes().some((frame) => "opacity" in frame),
        ),
    ),
  ).toBe(false);
  await expect
    .poll(() => source.evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
  const frames = await source.evaluate((element) =>
    element
      .getAnimations()
      .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes()),
  );
  expect(frames.some((frame) => "opacity" in frame)).toBe(false);
  expect(frames.map((frame) => frame.transform)).toEqual([
    "translateX(-6px)",
    "translateX(0px)",
    "translateX(3px)",
    "translateX(0px)",
  ]);
});

test("outdents with Backspace without an insertion fade", async ({ page }) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const runtime = window as unknown as {
      __rivtoDemo: {
        editor: DocumentEditorAPI;
      };
    };
    const editor = runtime.__rivtoDemo.editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "backspace-parent",
      type: "paragraph",
      content: "Parent",
      children: [{ id: "backspace-child", type: "paragraph", content: "Child" }],
    });
  });
  const child = surface.locator('[data-block-id="backspace-child"]');
  await child.locator("[data-block-content]").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await expect(
    surface.locator(
      '[data-virtual-block-id="backspace-child"] > [data-block-id="backspace-child"]',
    ),
  ).toHaveCount(1);
  const row = child.locator(":scope > .rivto-block-row");
  expect(
    await row.evaluate((element) =>
      element
        .getAnimations()
        .some((animation) =>
          (animation.effect as KeyframeEffect | null)
            ?.getKeyframes()
            .some((frame) => "opacity" in frame),
        ),
    ),
  ).toBe(false);
  expect(await child.evaluate((element) => element.getAnimations().length)).toBe(0);
});

test("outdents an empty nested block on Enter without animation", async ({ page }) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const runtime = window as unknown as {
      __rivtoDemo: {
        editor: DocumentEditorAPI;
      };
    };
    const editor = runtime.__rivtoDemo.editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "enter-parent",
      type: "paragraph",
      content: "Parent",
      children: [{ id: "enter-child", type: "paragraph", content: "" }],
    });
  });
  const child = surface.locator('[data-block-id="enter-child"]');
  await child.locator("[data-block-content]").click();
  await page.keyboard.press("Enter");
  await expect(
    surface.locator('[data-virtual-block-id="enter-child"] > [data-block-id="enter-child"]'),
  ).toHaveCount(1);
  const row = child.locator(":scope > .rivto-block-row");
  expect(await child.evaluate((element) => element.getAnimations().length)).toBe(0);
  expect(
    await row.evaluate((element) =>
      element
        .getAnimations()
        .some((animation) =>
          (animation.effect as KeyframeEffect).getKeyframes().some((frame) => "opacity" in frame),
        ),
    ),
  ).toBe(false);
});

test("indents a row inside a zoomed canvas card without animation", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-editor-mode="edgeless"]').click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  const card = page
    .locator("[data-edgeless-root]")
    .filter({ has: page.locator(".rivto-block-children") })
    .first();
  const root = card
    .locator(".edgeless-card-content > .rivto-block:has(> .rivto-block-children)")
    .first();
  const children = root.locator(":scope > .rivto-block-children > .rivto-block");
  const parentId = await children.first().getAttribute("data-block-id");
  const childId = await children.nth(1).getAttribute("data-block-id");
  expect(parentId).toBeTruthy();
  expect(childId).toBeTruthy();
  const child = root.locator(`[data-block-id="${childId}"]`).first();
  await child.locator("[data-block-content]").first().focus();
  await page.keyboard.press("Tab");
  await expect(
    root.locator(
      `:scope > .rivto-block-children > [data-block-id="${parentId}"] > .rivto-block-children > [data-block-id="${childId}"]`,
    ),
  ).toHaveCount(1);
  expect(await child.evaluate((element) => element.getAnimations().length)).toBe(0);
});
