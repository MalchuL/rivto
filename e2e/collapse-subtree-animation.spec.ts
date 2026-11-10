import { expect, test } from "@playwright/test";

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
        };
      }
    ).__rivtoDemo;
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

test("collapses and unmounts the subtree immediately", async ({ page }) => {
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
  expect(initialHeight).toBeGreaterThan(0);
  expect(await children.evaluate((element) => element.getAnimations().length)).toBe(0);
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
    expect(await children.evaluate((element) => element.getAnimations().length)).toBe(0);
    await expect
      .poll(() => children.evaluate((element) => getComputedStyle(element).opacity))
      .toBe("0.5");
    await toggle.click();
    await expect(children).toBeHidden();
    await expect(children.locator("[data-block-id]")).toHaveCount(0);
  });
}
