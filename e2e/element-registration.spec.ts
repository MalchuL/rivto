import { test, expect } from "@playwright/test";

test("registers a custom canvas type with creation, properties, resize, clipboard and independent panel roots", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?elementRegistration=1");
  const first = page.locator('[data-canvas="first"]');
  const second = page.locator('[data-canvas="second"]');
  await first.getByRole("button", { name: "Badge", exact: true }).click();
  await expect(second.getByRole("button", { name: "Badge", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const canvas = first.getByRole("main", { name: "Edgeless document canvas" });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 180, box!.y + 140);
  await page.mouse.down();
  await page.mouse.move(box!.x + 260, box!.y + 200, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(first.locator("[data-custom-badge]")).toHaveCount(0);
  await page.mouse.move(box!.x + 180, box!.y + 140);
  await page.mouse.down();
  await page.mouse.move(box!.x + 300, box!.y + 220, { steps: 8 });
  await page.mouse.up();
  await expect(first.locator("[data-custom-badge]")).toHaveCount(1);
  await expect(second.locator("[data-custom-badge]")).toHaveCount(0);
  await expect(first.getByRole("toolbar", { name: "Selected objects" })).toBeVisible();
  await first.getByRole("button", { name: "Select", exact: true }).click();
  const badge = first.locator("[data-custom-badge]");
  const beforeMove = await badge.boundingBox();
  expect(beforeMove).not.toBeNull();
  await page.keyboard.down("Alt");
  await page.mouse.move(beforeMove!.x + 20, beforeMove!.y + 25);
  await page.mouse.down();
  await page.mouse.move(beforeMove!.x + 60, beforeMove!.y + 45, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await badge.boundingBox())?.x).toBeCloseTo(beforeMove!.x + 40, 0);
  await first.getByLabel("Badge text").fill("Custom");
  await expect(first.locator("[data-custom-badge]")).toHaveText("Custom");
  await first.getByRole("button", { name: "Double width" }).click();
  await expect(first.locator("[data-custom-state]")).toContainText('"units":2');
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(first.locator("[data-custom-state]")).toContainText('"units":1');
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(first.locator("[data-custom-state]")).toContainText('"units":2');
  await first.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(first.locator("[data-custom-badge]")).toHaveCount(2);
  await expect(first.locator("[data-custom-state]")).toContainText('"copied":true');
  await page.getByRole("button", { name: "Toggle canvases" }).click();
  await page.getByRole("button", { name: "Toggle canvases" }).click();
  await expect(first.locator("[data-custom-badge]")).toHaveCount(2);
  await expect(second.locator("[data-custom-badge]")).toHaveCount(0);
  await first.getByRole("button", { name: "Badge", exact: true }).click();
  await page.getByRole("button", { name: "Unregister badge" }).click();
  await expect(first.getByRole("button", { name: "Select", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(first.locator("[data-custom-badge]")).toHaveCount(0);
  await expect(first.getByText("Unknown element: badge", { exact: true })).toHaveCount(2);
  await expect(first.locator("[data-custom-state]")).toContainText('"title":"Custom"');
  await expect(first.getByRole("button", { name: "Badge", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("keeps tools local to mounted React panels and resets them on remount", async ({ page }) => {
  await page.goto("/?elementRegistration=1");
  const first = page.locator('[data-canvas="first"]');
  const second = page.locator('[data-canvas="second"]');
  const badge = (panel: typeof first) => panel.getByRole("button", { name: "Badge", exact: true });
  const select = (panel: typeof first) =>
    panel.getByRole("button", { name: "Select", exact: true });
  await badge(first).click();
  await expect(badge(first)).toHaveAttribute("aria-pressed", "true");
  await expect(select(second)).toHaveAttribute("aria-pressed", "true");
  await badge(second).click();
  const canvas = first.getByRole("main", { name: "Edgeless document canvas" });
  await canvas.focus();
  await canvas.press("Escape");
  await expect(select(first)).toHaveAttribute("aria-pressed", "true");
  await expect(badge(second)).toHaveAttribute("aria-pressed", "true");
  await badge(first).click();
  await page.getByRole("button", { name: "Toggle canvases" }).click();
  await page.getByRole("button", { name: "Toggle canvases" }).click();
  await expect(select(first)).toHaveAttribute("aria-pressed", "true");
  await expect(select(second)).toHaveAttribute("aria-pressed", "true");
  await badge(first).click();
  await badge(second).click();
  await page.getByRole("button", { name: "Unregister badge" }).click();
  await expect(select(first)).toHaveAttribute("aria-pressed", "true");
  await expect(select(second)).toHaveAttribute("aria-pressed", "true");
});
