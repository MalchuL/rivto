import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { blockDropRegion } from "./drop-regions";

for (const reducedMotion of [false, true]) {
  test(`moves a nested subtree on indent and outdent with reduced motion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    await page.goto("/?test_features=1");
    const surface = page.locator('[data-journal-document="today"] > .page-surface');
    await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo;
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
    const content = root.locator(":scope > .rivto-block-row [data-block-content]");
    await content.click();
    for (const [key, selector] of [
      [
        "Tab",
        '[data-block-id="tree-parent"] > .rivto-block-children > [data-block-id="tree-root"]',
      ],
      ["Shift+Tab", '[data-virtual-block-id="tree-root"] > [data-block-id="tree-root"]'],
    ] as const) {
      await page.keyboard.press(key);
      await expect(surface.locator(selector)).toHaveCount(1);
      await expect(root.locator('[data-block-id="tree-child"]')).toBeVisible();
      await expect(content).toBeFocused();
      if (reducedMotion) {
        expect(await root.evaluate((element) => element.getAnimations().length)).toBe(0);
      } else {
        await expect
          .poll(() => root.evaluate((element) => element.getAnimations().length))
          .toBeGreaterThan(0);
        expect(
          await root.evaluate(
            (element) => element.getAnimations()[0]?.effect?.getTiming().duration,
          ),
        ).toBe(200);
        await root.evaluate(async (element) => {
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
        });
      }
    }
  });
}

test("animates multiple selected blocks together on indent and outdent", async ({ page }) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
      .__rivtoDemo;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({ id: "multi-parent", type: "paragraph", content: "Parent" });
    editor.blocks.insertBlock({
      id: "multi-first",
      type: "paragraph",
      content: "First",
      children: [{ id: "multi-child", type: "paragraph", content: "Child" }],
    });
    editor.blocks.insertBlock({ id: "multi-last", type: "paragraph", content: "Last" });
  });
  const first = surface.locator('[data-block-id="multi-first"]');
  const last = surface.locator('[data-block-id="multi-last"]');
  const child = surface.locator('[data-block-id="multi-child"]');
  await first.locator(":scope > .rivto-block-row [data-block-content]").click();
  await last
    .locator(":scope > .rivto-block-row [data-block-content]")
    .click({ modifiers: ["Shift"] });
  for (const [key, parent] of [
    ["Tab", "multi-parent"],
    ["Shift+Tab", null],
  ] as const) {
    await page.keyboard.press(key);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const blocks = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor.blocks;
          return [blocks.getParentId("multi-first"), blocks.getParentId("multi-last")];
        }),
      )
      .toEqual([parent, parent]);
    for (const block of [first, last]) {
      await expect
        .poll(() =>
          block.evaluate((element) =>
            element
              .getAnimations()
              .some((animation) =>
                (animation.effect as KeyframeEffect)
                  .getKeyframes()
                  .some((frame) => "transform" in frame),
              ),
          ),
        )
        .toBe(true);
    }
    const groupFrames = await Promise.all(
      [first, last].map((block) =>
        block.evaluate((element) => {
          const animation = element
            .getAnimations()
            .find((item) =>
              (item.effect as KeyframeEffect).getKeyframes().some((frame) => "transform" in frame),
            )!;
          return {
            frames: (animation.effect as KeyframeEffect)
              .getKeyframes()
              .map((frame) => frame.transform),
            duration: animation.effect?.getTiming().duration,
          };
        }),
      ),
    );
    expect(groupFrames[0]).toEqual(groupFrames[1]);
    expect(groupFrames[0]!.duration).toBe(200);
    expect(groupFrames[0]!.frames).toHaveLength(4);
    expect(groupFrames[0]!.frames[2]).toMatch(/^translate\(-?3px/);
    expect(
      await child.evaluate((element) =>
        element
          .getAnimations()
          .some((animation) =>
            (animation.effect as KeyframeEffect)
              .getKeyframes()
              .some((frame) => "transform" in frame),
          ),
      ),
    ).toBe(false);
    await first.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
  }
  await page.keyboard.press("Tab");
  await expect
    .poll(() => first.evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const blocks = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor.blocks;
        return [blocks.getParentId("multi-first"), blocks.getParentId("multi-last")];
      }),
    )
    .toEqual([null, null]);
  for (const block of [first, last]) {
    await expect
      .poll(() => block.evaluate((element) => getComputedStyle(element).transform))
      .toBe("none");
    await expect(block).toHaveAttribute("data-block-selected", "true");
    expect(
      await block.evaluate((element: HTMLElement) => ({
        width: element.style.width,
        height: element.style.height,
        boxSizing: element.style.boxSizing,
      })),
    ).toEqual({ width: "", height: "", boxSizing: "" });
  }
});

test("moves a selected parent and child with one rebound", async ({ page }) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
      .__rivtoDemo;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({ id: "nested-target", type: "paragraph", content: "Target" });
    editor.blocks.insertBlock({
      id: "nested-parent",
      type: "paragraph",
      content: "Parent",
      children: [{ id: "nested-child", type: "paragraph", content: "Child" }],
    });
  });
  const parent = surface.locator('[data-block-id="nested-parent"]');
  const child = surface.locator('[data-block-id="nested-child"]');
  await parent.locator(":scope > .rivto-block-row [data-block-content]").click();
  await child
    .locator(":scope > .rivto-block-row [data-block-content]")
    .click({ modifiers: ["Shift"] });
  await expect(parent).toHaveAttribute("data-block-selected", "true");
  await expect(child).toHaveAttribute("data-block-selected", "true");
  await page.keyboard.press("Tab");
  await expect(
    surface.locator(
      '[data-block-id="nested-target"] > .rivto-block-children > [data-block-id="nested-parent"]',
    ),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      parent.evaluate((element) =>
        element
          .getAnimations()
          .some((animation) =>
            (animation.effect as KeyframeEffect)
              .getKeyframes()
              .some((frame) => "transform" in frame),
          ),
      ),
    )
    .toBe(true);
  const frames = await parent.evaluate((element) =>
    (
      element
        .getAnimations()
        .find((animation) =>
          (animation.effect as KeyframeEffect).getKeyframes().some((frame) => "transform" in frame),
        )!.effect as KeyframeEffect
    ).getKeyframes(),
  );
  expect(frames).toHaveLength(4);
  expect(
    await child.evaluate((element) =>
      element
        .getAnimations()
        .some((animation) =>
          (animation.effect as KeyframeEffect).getKeyframes().some((frame) => "transform" in frame),
        ),
    ),
  ).toBe(false);
});

test("interrupts an indent when the same block is immediately outdented", async ({ page }) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
      .__rivtoDemo;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({ id: "rapid-parent", type: "paragraph", content: "Parent" });
    editor.blocks.insertBlock({ id: "rapid-child", type: "paragraph", content: "Child" });
  });
  const child = surface.locator('[data-block-id="rapid-child"]');
  const content = child.locator("[data-block-content]");
  await content.click();
  await page.keyboard.press("Tab");
  await expect
    .poll(() => child.evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
  await page.keyboard.press("Shift+Tab");
  await expect(
    surface.locator('[data-virtual-block-id="rapid-child"] > [data-block-id="rapid-child"]'),
  ).toHaveCount(1);
  await expect(content).toBeFocused();
  await expect
    .poll(() => child.evaluate((element) => getComputedStyle(element).transform))
    .toBe("none");
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

test("animates outdent with Backspace without an insertion fade", async ({ page }) => {
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
  await expect
    .poll(() => child.evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
});

test("animates outdent of an empty nested block on Enter", async ({ page }) => {
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
  await expect
    .poll(() => child.evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
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

test("animates indent inside a zoomed canvas card", async ({ page }) => {
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
  await expect
    .poll(() => child.evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
});
