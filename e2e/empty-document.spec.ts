import { expect, test } from "@playwright/test";
import { ROOT_BLOCK_SELECTOR, BLOCK_ROW_SELECTOR } from "./dom-markers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("creates every paragraph through the chosen trailing insertion target", async ({ page }) => {
  const document = page.locator('[data-journal-document="today"]');
  const surface = document.locator(":scope > .page-surface");
  const roots = surface.locator(ROOT_BLOCK_SELECTOR);
  const affordances = document.locator(".page-trailing-block");
  await expect(affordances).toHaveCount(3);
  const paragraphHeight = await roots
    .first()
    .locator(`:scope > ${BLOCK_ROW_SELECTOR} [data-block-content]`)
    .first()
    .evaluate((element) => element.getBoundingClientRect().height);
  await expect
    .poll(() => affordances.first().evaluate((element) => element.getBoundingClientRect().height))
    .toBeCloseTo(paragraphHeight, 0);

  await page.evaluate(() => {
    const editor = (
      window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }
    ).__rivtoDemo.editor;
    editor.blocks.removeBlocks(editor.blocks.getRootIds());
    editor.history.clear();
  });
  await page.mouse.move(0, 0);
  await expect(roots).toHaveCount(0);
  await expect(surface).toHaveAttribute("data-empty", "true");
  await expect(affordances).toHaveCount(3);
  const affordance = document.getByRole("button", { name: "Add 3 blocks" });
  await expect(affordance).toBeVisible();
  await expect(affordance).toHaveText("Add block");
  await expect(affordance).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(affordance).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await affordance.focus();
  await expect(affordance).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
  // The current UI draws keyboard focus with a ring (box shadow).
  await expect(affordance).not.toHaveCSS("box-shadow", "none");
  await affordance.hover();
  await expect(affordance).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await affordance.click();

  await expect(roots).toHaveCount(3);
  expect(
    await roots.evaluateAll((blocks) =>
      blocks.map((block) => block.getAttribute("data-block-type")),
    ),
  ).toEqual(["paragraph", "paragraph", "paragraph"]);
  await expect(roots.last().locator("[data-block-content]")).toBeFocused();
  await expect(affordances).toHaveCount(3);
  await expect
    .poll(() =>
      surface.evaluate((element) => element.lastElementChild?.hasAttribute("data-page-end-slot")),
    )
    .toBe(true);

  await page.keyboard.press("Control+z");
  await expect(roots).toHaveCount(0);
  await expect(affordances).toHaveCount(3);

  await page.locator('[data-editor-mode="edgeless"]').click();
  await expect(affordances).toHaveCount(0);
});
