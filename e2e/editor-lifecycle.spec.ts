import { expect, test } from "@playwright/test";

test("hook owns committed editors, shares views and preserves borrowed models", async ({ page }) => {
  await page.goto("/?editorLifecycle=1");
  await expect(page.locator('[data-lifecycle-state="ready"]')).toHaveAttribute("data-document", "first");
  await expect(page.locator('[data-block-id="first-block"]')).toHaveCount(2);
  const read = async () => {
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    return JSON.parse((await page.locator("[data-lifecycle-counts]").textContent())!) as { setup: number; cleanup: number; errors: number; models: string[][] };
  };
  const first = await read();
  expect(first.setup - first.cleanup).toBe(1);
  if (await page.locator("[data-lifecycle-counts]").getAttribute("data-development") === "true") {
    expect(first.setup).toBeGreaterThanOrEqual(2);
    expect(first.cleanup).toBeGreaterThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Replace document" }).click();
  await expect(page.locator('[data-lifecycle-state="ready"]')).toHaveAttribute("data-document", "second");
  const second = await read();
  expect(second.setup).toBeGreaterThan(first.setup);
  expect(second.setup - second.cleanup).toBe(1);
  await page.getByRole("button", { name: "Toggle mount" }).click();
  await expect(page.locator('[data-lifecycle-state]')).toHaveCount(0);
  const unmounted = await read();
  expect(unmounted.cleanup).toBe(unmounted.setup);
  expect(unmounted.models).toEqual([["first-block"], ["second-block"]]);
  await page.getByRole("button", { name: "Toggle suspended" }).click();
  await page.getByRole("button", { name: "Toggle mount" }).click();
  await expect(page.getByText("Suspended", { exact: true })).toBeVisible();
  expect((await read()).setup).toBe(unmounted.setup);
  await page.getByRole("button", { name: "Toggle failure" }).click();
  await page.getByRole("button", { name: "Toggle suspended" }).click();
  await expect(page.locator('[data-lifecycle-state="error"]')).toBeVisible();
  const failure = await read();
  expect(failure.errors).toBeGreaterThan(0);
  expect(failure.cleanup).toBe(failure.setup);
  expect(failure.models).toEqual(unmounted.models);
});


test("hook reports rejected core cleanup and leaves borrowed models usable", async ({ page }) => {
  const unhandled: string[] = [];
  page.on("pageerror", error => unhandled.push(error.message));
  await page.goto("/?editorLifecycle=1");
  await expect(page.locator('[data-lifecycle-state="ready"]')).toBeVisible();
  await page.getByRole("button", { name: "Fail cleanup", exact: true }).click();
  await page.getByRole("button", { name: "Toggle mount", exact: true }).click();
  await expect(page.locator('[data-lifecycle-state]')).toHaveCount(0);
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  const counts = JSON.parse((await page.locator("[data-lifecycle-counts]").textContent())!);
  expect(counts.errors).toBe(1);
  expect(counts.cleanup).toBe(counts.setup);
  expect(counts.models).toEqual([["first-block"], ["second-block"]]);
  expect(unhandled).toEqual([]);
});
