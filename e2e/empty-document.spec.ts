import { expect, test } from "@playwright/test";
import { BLOCK_ID_SELECTOR } from "./dom-markers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("creates every paragraph through the chosen trailing insertion target", async ({ page }) => {
  const roots = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`);
  const affordances = page.locator(".page-trailing-block");
  await expect(affordances).toHaveCount(3);
  const paragraphHeight = await roots.first()
    .locator(":scope > .page-block-row .page-block-content")
    .first()
    .evaluate((element) => element.getBoundingClientRect().height);
  await expect.poll(() => affordances.first().evaluate(
    (element) => element.getBoundingClientRect().height,
  )).toBeCloseTo(paragraphHeight, 0);

  const count = await roots.count();
  for (let index = 0; index < count; index += 1) {
    const row = roots.nth(index).locator(":scope > .page-block-row");
    await row.click({ modifiers: ["Control"], position: { x: 4, y: 4 } });
  }
  await expect(page.locator("[data-block-selected]")).toHaveCount(count);

  await page.keyboard.press("Delete");
  await expect(roots).toHaveCount(0);
  await expect(page.locator(".page-surface")).toHaveAttribute("data-empty", "true");
  await expect(affordances).toHaveCount(3);
  const affordance = page.getByRole("button", { name: "Add 3 blocks" });
  await expect(affordance).toBeVisible();
  await expect(affordance).toHaveText("+ Add block");
  await expect(affordance).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(affordance).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await affordance.focus();
  await expect(affordance).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(affordance).toHaveCSS("outline-style", "solid");
  await affordance.hover();
  await expect(affordance).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await affordance.click();

  await expect(roots).toHaveCount(3);
  expect(await roots.evaluateAll((blocks) => blocks.map(
    (block) => block.getAttribute("data-block-type"),
  ))).toEqual(["paragraph", "paragraph", "paragraph"]);
  await expect(roots.last().locator("[data-block-content]")).toBeFocused();
  await expect(affordances).toHaveCount(3);
  await expect.poll(() => page.locator(".page-surface").evaluate(
    (element) => element.lastElementChild?.hasAttribute("data-page-end-slot"),
  )).toBe(true);

  await page.keyboard.press("Control+z");
  await expect(roots).toHaveCount(0);
  await expect(affordances).toHaveCount(3);

  await page.locator('[data-editor-mode="edgeless"]').click();
  await expect(affordances).toHaveCount(0);
});
