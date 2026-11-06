import { expect, test } from "@playwright/test";

/** One rendered frame of an expanding subtree. */
interface ExpansionFrame {
  readonly time: number;
  readonly height: number;
  readonly inlineHeight: string;
}

test("continues closing throughout the collapse transition", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    (
      window as unknown as { __rivtoDemo: { reactEditor: { animations: Record<string, number> } } }
    ).__rivtoDemo.reactEditor.animations.blockExpand = 1.2;
  });
  const parent = page
    .locator('[data-journal-document="today"] .rivto-block:has(> .rivto-block-children)')
    .first();
  const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
  const children = parent.locator(":scope > .rivto-block-children");
  const initialHeight = await children.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await toggle.evaluate((element) => {
    const children = element
      .closest(".rivto-block")!
      .querySelector<HTMLElement>(":scope > .rivto-block-children")!;
    const host = window as unknown as { collapseFrame: Promise<ExpansionFrame> };
    host.collapseFrame = new Promise((resolve) => {
      element.addEventListener(
        "click",
        () => {
          const start = performance.now();
          const sample = () => {
            const time = performance.now() - start;
            if (time < 450) {
              requestAnimationFrame(sample);
            } else {
              resolve({
                time,
                height: children.getBoundingClientRect().height,
                inlineHeight: children.style.height,
              });
            }
          };
          requestAnimationFrame(sample);
        },
        { once: true },
      );
    });
  });
  await toggle.click();
  const frame = await page.evaluate(
    () => (window as unknown as { collapseFrame: Promise<ExpansionFrame> }).collapseFrame,
  );
  expect(frame.height).toBeGreaterThan(initialHeight * 0.25);
  expect(frame.height).toBeLessThan(initialHeight * 0.85);
  await expect(children).toBeHidden();
});

test("reveals children without showing the full height first or jumping at the end", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    (
      window as unknown as { __rivtoDemo: { reactEditor: { animations: Record<string, number> } } }
    ).__rivtoDemo.reactEditor.animations.blockExpand = 1.2;
  });
  const parent = page
    .locator('[data-journal-document="today"] .rivto-block:has(> .rivto-block-children)')
    .first();
  const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
  const children = parent.locator(":scope > .rivto-block-children");
  await toggle.click();
  await expect(children).toBeHidden();
  await toggle.evaluate((element) => {
    const children = element
      .closest(".rivto-block")!
      .querySelector<HTMLElement>(":scope > .rivto-block-children")!;
    const host = window as unknown as {
      expansionFrames: Promise<ExpansionFrame[]>;
    };
    host.expansionFrames = new Promise((resolve) => {
      element.addEventListener(
        "click",
        () => {
          const start = performance.now();
          const frames: ExpansionFrame[] = [];
          setTimeout(() => {
            const extra = document.createElement("div");
            extra.style.height = "48px";
            children.querySelector("[data-block-id]")!.append(extra);
          }, 150);
          const sample = () => {
            const time = performance.now() - start;
            frames.push({
              time,
              height: children.getBoundingClientRect().height,
              inlineHeight: children.style.height,
            });
            if (time < 1500) {
              requestAnimationFrame(sample);
            } else {
              resolve(frames);
            }
          };
          requestAnimationFrame(sample);
        },
        { once: true },
      );
    });
  });
  await toggle.click();
  const frames = await page.evaluate(
    () =>
      (
        window as unknown as {
          expansionFrames: Promise<ExpansionFrame[]>;
        }
      ).expansionFrames,
  );
  const finalHeight = frames.at(-1)!.height;
  expect(frames[0]!.height).toBeLessThan(finalHeight * 0.35);
  const nearEnd = frames.filter((frame) => frame.inlineHeight !== "").at(-1)!;
  expect(nearEnd).toBeDefined();
  expect(finalHeight - nearEnd.height).toBeLessThan(finalHeight * 0.12);
});

test("restores the subtree height and following block position after expanding", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __rivtoDemo: {
          editor: import("@chulane/rivto").DocumentEditorAPI;
          reactEditor: { animations: Record<string, number> };
        };
      }
    ).__rivtoDemo;
    runtime.reactEditor.animations.blockInsert = 0;
    runtime.editor.load({ ...runtime.editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    runtime.editor.blocks.insertBlock({
      id: "expand-parent",
      type: "paragraph",
      content: "Parent",
      children: [
        { id: "expand-first", type: "paragraph", content: "First child" },
        { id: "expand-last", type: "paragraph", content: "Last child" },
      ],
    });
    runtime.editor.blocks.insertBlock({
      id: "expand-following",
      type: "paragraph",
      content: "Following",
    });
  });
  const parent = surface.locator('[data-block-id="expand-parent"]');
  const children = parent.locator(":scope > .rivto-block-children");
  const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
  const following = surface.locator('[data-block-id="expand-following"]');
  const expectedHeight = await children.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await toggle.click();
  await expect(children).toBeHidden();
  await toggle.click();
  await expect
    .poll(() => children.evaluate((element) => element.getBoundingClientRect().height))
    .toBeCloseTo(expectedHeight, 0);
  const childBottom = (await children.locator('[data-block-id="expand-last"]').boundingBox())!;
  const followingBounds = (await following.boundingBox())!;
  expect(followingBounds.y).toBeGreaterThanOrEqual(childBottom.y + childBottom.height);
  await expect
    .poll(() => children.evaluate((element: HTMLElement) => element.style.height))
    .toBe("");
});

test("collapses the subtree before unmounting it", async ({ page }) => {
  await page.goto("/?test_features=1");
  const parent = page
    .locator('[data-journal-document="today"] .rivto-block:has(> .rivto-block-children)')
    .first();
  const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
  const children = parent.locator(":scope > .rivto-block-children");
  const initialHeight = await children.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await toggle.click();
  await expect(children.locator("[data-block-id]").first()).toBeAttached();
  await expect
    .poll(() => children.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(initialHeight);
  await expect(children).toHaveAttribute("inert", "");
  await expect(children).toBeHidden();
  await expect(children.locator("[data-block-id]")).toHaveCount(0);
});

test("reopening during collapse keeps the subtree visible", async ({ page }) => {
  await page.goto("/?test_features=1");
  const parent = page
    .locator('[data-journal-document="today"] .rivto-block:has(> .rivto-block-children)')
    .first();
  const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
  const children = parent.locator(":scope > .rivto-block-children");
  const initialHeight = await children.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  await toggle.click();
  await expect(children).toHaveAttribute("inert", "");
  await toggle.click();
  await expect(children).toBeVisible();
  await expect(children).not.toHaveAttribute("inert", "");
  await expect(children.locator("[data-block-id]").first()).toBeAttached();
  await expect
    .poll(() => children.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(initialHeight);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`expands the child subtree with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/?test_features=1");
    const parent = page
      .locator('[data-journal-document="today"] .rivto-block:has(> .rivto-block-children)')
      .first();
    const toggle = parent.locator(":scope > .rivto-block-row [data-collapse-toggle]");
    const children = parent.locator(":scope > .rivto-block-children");
    await page.addStyleTag({ content: "[data-test-opacity] { opacity: 0.5; }" });
    await children.evaluate((element) => {
      element.setAttribute("data-test-opacity", "true");
    });
    await toggle.click();
    await expect(children).toBeHidden();
    await expect(children.locator("[data-block-id]")).toHaveCount(0);
    await toggle.click();
    await expect(children).toBeVisible();
    await expect(children.locator("[data-block-id]").first()).toBeAttached();
    await expect
      .poll(() =>
        children.evaluate(
          (element) => element.getBoundingClientRect().height < element.scrollHeight,
        ),
      )
      .toBe(true);
    if (reducedMotion === "no-preference") {
      await expect
        .poll(() =>
          children.evaluate((element) => element.getAnimations()[0]?.effect?.getTiming().duration),
        )
        .toBe(300);
    }
    await expect
      .poll(() => children.evaluate((element) => getComputedStyle(element).opacity))
      .toBe("0.5");
    await toggle.click();
    await expect(children).toBeHidden();
    await expect(children.locator("[data-block-id]")).toHaveCount(0);
  });
}
