import { expect, test } from "@playwright/test";

test("application-registered canvas tool previews, cancels and commits only on release", async ({
  page,
}) => {
  await page.goto("/");
  const toolbar = page.getByRole("toolbar", { name: "Canvas tools", exact: true });
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "demo-shapes", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Rectangle", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const viewport = (await page.getByRole("main", { name: "Independent canvas" }).boundingBox())!;
  const x = viewport.x + 650,
    y = viewport.y + 180;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 70, { steps: 4 });
  await expect(page.locator("[data-demo-creation-preview]")).toBeVisible();
  await expect(page.locator('[data-canvas-element="10000"]')).toHaveCount(0);
  await expect(page.getByLabel("Committed gestures")).toHaveText("0");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("[data-demo-creation-preview]")).toHaveCount(0);
  await expect(page.getByLabel("Committed gestures")).toHaveText("0");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 70, { steps: 4 });
  const preview = (await page.locator("[data-demo-creation-preview]").boundingBox())!;
  await page.mouse.up();
  await expect(page.getByLabel("Committed gestures")).toHaveText("1");
  expect(await page.locator('[data-canvas-element="10000"]').boundingBox()).toEqual(preview);
  await expect(page.getByRole("dialog", { name: "demo-shapes", exact: true })).toBeVisible();
  await toolbar.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Select", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("registered Hand keeps its icon and pans without moving source elements", async ({ page }) => {
  await page.goto("/");
  const toolbar = page.getByRole("toolbar", { name: "Canvas tools", exact: true });
  const hand = toolbar.getByRole("button", { name: "Hand", exact: true });
  await expect(hand.locator("svg")).toBeVisible();
  await hand.click();
  const first = page.locator('[data-canvas-element="0"]');
  const before = (await first.boundingBox())!;
  await page.mouse.move(before.x + 40, before.y + 30);
  await page.mouse.down();
  await page.mouse.move(before.x + 140, before.y + 90, { steps: 4 });
  await page.mouse.up();
  const after = (await first.boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(100, 0);
  expect(after.y - before.y).toBeCloseTo(60, 0);
  await expect(page.getByLabel("Committed gestures")).toHaveText("0");
  await toolbar.getByRole("button", { name: "Select", exact: true }).click();
  await expect(hand).toHaveAttribute("aria-pressed", "false");
});

test("an unrelated pointer release does not finish the active camera gesture", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hand", exact: true }).click();
  const element = page.locator('[data-canvas-element="0"]');
  const start = (await element.boundingBox())!;
  await page.mouse.move(start.x + 50, start.y + 50);
  await page.mouse.down();
  await page.mouse.move(start.x + 90, start.y + 70);
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 9999 }));
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 9999 }));
  });
  await page.mouse.move(start.x + 150, start.y + 110);
  const moved = (await element.boundingBox())!;
  expect(moved.x - start.x).toBeCloseTo(100, 1);
  expect(moved.y - start.y).toBeCloseTo(60, 1);
  await page.mouse.up();
  await page.mouse.move(start.x + 250, start.y + 200);
  expect(await element.boundingBox()).toEqual(moved);
  await expect(page.getByLabel("Committed gestures")).toHaveText("0");
});
