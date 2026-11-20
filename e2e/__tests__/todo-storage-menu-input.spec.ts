import { expect, test } from "@playwright/test";

for (const mode of ["block", "edgeless"] as const) {
  test(`preserves consumed Escape inside a TODO menu in ${mode}`, async ({ page }) => {
    await page.goto("/");
    if (mode === "edgeless") {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }
    const storage = page
      .locator('[data-journal-document="today"] [data-block-type="todo-storage"]')
      .first();
    await storage.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const trigger = storage.getByText("Filter", { exact: true });
    const menu = page.getByRole("dialog", { name: "Filters" });
    await trigger.click();
    const checkbox = menu.getByLabel("Todo", { exact: true });
    await checkbox.focus();
    await checkbox.evaluate((element) => {
      element.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });
}
