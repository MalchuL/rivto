/**
 * Verifies visible error notifications at authentication and browser boundaries.
 * Real Sonner rendering checks that failures reach the shared toast host without
 * removing the existing inline authentication feedback.
 */
import { expect, test } from "@playwright/test";

/** @param fixtures - Isolated application page. @returns Resolves after an API error is shown as a toast. */
test("authentication failures display an error toast", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("missing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("invalid password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText(/invalid/i);
  await expect(page.getByRole("region", { name: "Sign in", exact: true }).getByRole("alert")).toBeVisible();
});

/** @param fixtures - Isolated application page. @returns Resolves after uncaught errors and rejected promises reach one toast each. */
test("global failures display deduplicated error toasts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const error = new Error("Unexpected editing failure");
    window.dispatchEvent(new ErrorEvent("error", { error, message: error.message }));
    window.dispatchEvent(new ErrorEvent("error", { error, message: error.message }));
    window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(), reason: "Background operation failed",
    }));
  });
  const toasts = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(toasts.filter({ hasText: "Unexpected editing failure" })).toHaveCount(1);
  await expect(toasts.filter({ hasText: "Background operation failed" })).toHaveCount(1);
});

/** @param fixtures - Isolated application page. @returns Resolves after a render failure produces recovery UI and a toast. */
test("route rendering failures show a toast and offer retry", async ({ page }) => {
  await page.route("**/api/auth/get-session**", async (route) => {
    await route.fulfill({ json: { user: { id: "test-user", name: "Alice" }, session: { id: "test-session" } } });
  });
  let broken = true;
  await page.route("**/api/local", async (route) => {
    await route.fulfill({ json: { user: { name: "Alice" }, users: [], workspaces: broken ? null : [], deletedWorkspaces: [] } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible();
  broken = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspaces", exact: true })).toBeVisible();
});
