import { expect, test } from "@playwright/test";

test("hook owns committed editors, shares views and preserves borrowed models", async ({ page }) => {
  await page.goto("/?editorLifecycle=1");
  await expect(page.locator('[data-lifecycle-state="ready"]')).toHaveAttribute("data-document", "first");
  await expect(page.locator('[data-block-id="first-block"]')).toHaveCount(2);
  const read = async () => {
    await page.getByRole("button", { name: "Inspect", exact: true }).click();
    return JSON.parse((await page.locator("[data-lifecycle-counts]").textContent())!) as { setup: number; cleanup: number; panelsCreated: number; panelsDestroyed: number; errors: number; models: string[][] };
  };
  const first = await read();
  expect(first.setup - first.cleanup).toBe(1);
  expect(first.panelsCreated - first.panelsDestroyed).toBe(2);
  const firstPanelIds = await page.locator("[data-lifecycle-panel]").evaluateAll(elements => elements.map(element => element.getAttribute("data-lifecycle-panel")));
  expect(new Set(firstPanelIds).size).toBe(2);
  await expect(page.locator('[data-lifecycle-panel][data-same-panel="true"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Toggle suspended panels", exact: true }).click();
  await expect(page.getByText("Panels suspended", { exact: true })).toBeVisible();
  const abandonedPanel = await read();
  expect(abandonedPanel.panelsCreated).toBe(first.panelsCreated);
  expect(abandonedPanel.panelsDestroyed).toBe(first.panelsDestroyed);
  await page.getByRole("button", { name: "Toggle suspended panels", exact: true }).click();
  if (await page.locator("[data-lifecycle-counts]").getAttribute("data-development") === "true") {
    expect(first.setup).toBeGreaterThanOrEqual(2);
    expect(first.cleanup).toBeGreaterThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Replace document" }).click();
  await expect(page.locator('[data-lifecycle-state="ready"]')).toHaveAttribute("data-document", "second");
  const second = await read();
  expect(second.setup).toBeGreaterThan(first.setup);
  expect(second.setup - second.cleanup).toBe(1);
  expect(second.panelsCreated - second.panelsDestroyed).toBe(2);
  const secondPanelIds = await page.locator("[data-lifecycle-panel]").evaluateAll(elements => elements.map(element => element.getAttribute("data-lifecycle-panel")));
  expect(secondPanelIds.every(id => !firstPanelIds.includes(id))).toBe(true);
  await page.getByRole("button", { name: "Toggle mount" }).click();
  await expect(page.locator('[data-lifecycle-state]')).toHaveCount(0);
  const unmounted = await read();
  expect(unmounted.cleanup).toBe(unmounted.setup);
  expect(unmounted.panelsDestroyed).toBe(unmounted.panelsCreated);
  expect(unmounted.models).toEqual([["first-block"], ["second-block"]]);
  await page.getByRole("button", { name: "Toggle suspended" }).click();
  await page.getByRole("button", { name: "Toggle mount" }).click();
  await expect(page.getByText("Suspended", { exact: true })).toBeVisible();
  const suspended = await read();
  expect(suspended.setup).toBe(unmounted.setup);
  expect(suspended.panelsCreated).toBe(unmounted.panelsCreated);
  await page.getByRole("button", { name: "Toggle failure" }).click();
  await page.getByRole("button", { name: "Toggle suspended" }).click();
  await expect(page.locator('[data-lifecycle-state="error"]')).toBeVisible();
  const failure = await read();
  expect(failure.errors).toBeGreaterThan(0);
  expect(failure.cleanup).toBe(failure.setup);
  expect(failure.panelsDestroyed).toBe(failure.panelsCreated);
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
