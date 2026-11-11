import { expect, test } from "@playwright/test";

for (const mode of ["Page", "Edgeless"] as const) {
  test(`embedded whitespace reveals its own row and keeps context-menu selection in ${mode}`, async ({
    page,
  }) => {
    await page.goto("/?test_features=1");
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
    const handleBox = (await handle.boundingBox())!;
    await handle.click({ button: "right" });
    await expect(row.locator("..")).toHaveAttribute("data-block-selected", "true");
    await expect(page.getByRole("menu")).toBeVisible();
    // The fixed anchor must stay at the pointer even inside the transformed Edgeless canvas.
    const anchor = page.locator('[data-slot="dropdown-menu-trigger"][aria-hidden="true"]');
    await expect
      .poll(async () => {
        const box = (await anchor.boundingBox())!;
        return Math.hypot(
          box.x - (handleBox.x + handleBox.width / 2),
          box.y - (handleBox.y + handleBox.height / 2),
        );
      })
      .toBeLessThan(2);
    // Collision handling may flip the menu, but it must still touch the click position.
    const menuBox = (await page.getByRole("menu").boundingBox())!;
    const x = handleBox.x + handleBox.width / 2;
    const y = handleBox.y + handleBox.height / 2;
    expect(Math.max(menuBox.x - x, x - menuBox.x - menuBox.width, 0)).toBeLessThan(10);
    expect(Math.max(menuBox.y - y, y - menuBox.y - menuBox.height, 0)).toBeLessThan(10);
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
