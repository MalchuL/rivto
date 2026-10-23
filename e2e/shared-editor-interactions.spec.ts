import { expect, test } from "@playwright/test";

for (const mode of ["Page", "Edgeless"] as const) {
  test(`embedded whitespace reveals its own row and keeps context-menu selection in ${mode}`, async ({
    page,
  }) => {
    await page.goto("/");
    const today = page.locator('[data-journal-document="today"]');
    if (mode === "Edgeless") {
      await today.getByRole("button", { name: mode, exact: true }).click();
    }
    const root = today.getByRole("region", { name: "Block editor" });
    const row = root.locator(".rivto-block-row").first();
    await row.scrollIntoViewIfNeeded();
    const rootBox = (await root.boundingBox())!;
    const rowBox = (await row.boundingBox())!;
    await page.mouse.move(rootBox.x + 2, rowBox.y + rowBox.height / 2);
    await expect(row).toHaveAttribute("data-block-row-hover", "");
    await expect(today.locator("[data-block-row-hover]")).toHaveCount(1);
    const handle = row.locator(":scope > .rivto-block-slot > .block-handle");
    await expect(handle).toHaveCSS("opacity", "1");
    await handle.click({ button: "right" });
    await expect(row.locator("..")).toHaveAttribute("data-block-selected", "true");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
  });
}

test("row hover and menus stay local between independent documents", async ({ page }) => {
  await page.goto("/?editors=2");
  for (const side of ["left", "right"] as const) {
    const pane = page.locator(`[data-multi-editor="${side}"]`);
    const row = pane.locator(`[data-block-id="${side}-counter"] > .rivto-block-row`);
    const box = (await row.boundingBox())!;
    await page.mouse.move(box.x - 30, box.y + box.height / 2);
    await expect(row).toHaveAttribute("data-block-row-hover", "");
    await expect(page.locator("[data-block-row-hover]")).toHaveCount(1);
    await row.locator(".block-handle").click({ button: "right" });
    await expect(row.locator("..")).toHaveAttribute("data-block-selected", "true");
    await page.keyboard.press("Escape");
  }
});

test("a block uses the same drag path into another document and back", async ({ page }) => {
  await page.goto("/?editors=2");
  for (const side of ["right", "left"] as const) {
    const source = page.locator('[data-block-id="left-counter"] > .rivto-block-row');
    const destination = page.locator(
      `[data-block-id="${side === "right" ? "right-target" : "left-stay"}"] > .rivto-block-row`,
    );
    await source.hover();
    await source.locator(".block-handle").dragTo(destination);
    const pane = page.locator(`[data-multi-editor="${side}"]`);
    await expect(pane.locator('[data-block-id="left-counter"]')).toHaveAttribute(
      "data-block-selected",
      "true",
    );
    await expect(page.locator('[data-block-id="left-counter"]')).toHaveCount(1);
    await expect(destination.locator("..").locator('[data-block-id="left-counter"]')).toHaveCount(
      1,
    );
  }
});
