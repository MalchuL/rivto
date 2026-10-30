import { expect, test } from "@playwright/test";

test("a host tool owns its gesture and React preview through the open registration contract", async ({
  page,
}) => {
  await page.goto("/?elementRegistration=1&customTool=1");
  const first = page.locator('[data-canvas="first"]');
  const second = page.locator('[data-canvas="second"]');
  const toolbar = first.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Host tools", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Host stamp", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(second.getByRole("button", { name: "Select", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const bounds = (await first.locator(".edgeless-viewport").boundingBox())!;
  await page.mouse.move(bounds.x + 180, bounds.y + 150);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 230, bounds.y + 180, { steps: 4 });
  const preview = first.locator("[data-host-tool-preview]");
  await expect(preview).toHaveText("Host preview");
  await expect(preview).toHaveCSS("background-color", "rgb(199, 210, 254)");
  await expect(first.locator("[data-custom-badge]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(first.locator("[data-custom-badge]")).toHaveCount(0);
  // Popover Escape returns to the configured default; select the registered tool again.
  await toolbar.getByRole("button", { name: "Select", exact: true }).click();
  await toolbar.getByRole("button", { name: "Host tools", exact: true }).click();
  await page.mouse.move(bounds.x + 180, bounds.y + 150);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 260, bounds.y + 200, { steps: 4 });
  await expect(preview).toBeVisible();
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(first.locator("[data-custom-badge]")).toHaveText("Host gesture");
  await expect(second.locator("[data-custom-badge]")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(first.locator("[data-custom-badge]")).toHaveCount(0);
  await page.getByRole("button", { name: "Unregister host tool", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Host tools", exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Select", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
