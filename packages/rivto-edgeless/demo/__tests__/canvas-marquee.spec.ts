import { expect, test } from "@playwright/test";

test("selects an item with a viewport-clipped marquee and removes it on unmount", async ({
  page,
}) => {
  await page.goto("/");
  const viewport = page.getByRole("main", { name: "Independent canvas" });
  const bounds = (await viewport.boundingBox())!;
  await page.mouse.move(bounds.x + 10, bounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 200, bounds.y + 150, { steps: 4 });
  const overlay = viewport.locator(":scope > div").last();
  await expect(overlay).toHaveCSS("position", "absolute");
  await expect(overlay).toHaveCSS("display", "block");
  await expect(viewport).toHaveCSS("overflow", "hidden");
  await expect(page.locator('[data-canvas-controls-for="0"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(overlay).toHaveCSS("display", "none");
  await page.getByRole("button", { name: "Hide canvas" }).click();
  await expect(viewport).toHaveCount(0);
});
