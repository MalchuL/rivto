import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`collapses and rapidly reopens canvas properties with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/?test_features=1");
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes" }).click();
    await page
      .getByRole("dialog", { name: "shapes tools" })
      .getByRole("button", { name: "Rectangle" })
      .click();
    await page
      .locator(".edgeless-drawing-capture[data-active]")
      .click({ position: { x: 100, y: 100 } });
    await toolbar.getByRole("button", { name: "Select" }).click();
    const panel = page.getByRole("region", { name: "Visual properties" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Collapse properties" }).click();
    await expect(panel).toHaveAttribute("data-collapsed", "true");
    await panel.getByRole("button", { name: "Expand properties" }).click();
    await expect(panel).not.toHaveAttribute("data-collapsed", "true");
    await expect(panel.getByLabel("Fill color")).toBeVisible();
    await expect(panel.locator('[data-slot="collapsible-content"]')).toHaveCSS(
      "overflow",
      "visible",
    );
    await panel.getByRole("button", { name: "Collapse properties" }).click();
    await expect(panel.getByLabel("Fill color")).toHaveCount(0);
  });
}
