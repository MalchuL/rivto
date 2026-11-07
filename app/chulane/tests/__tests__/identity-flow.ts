/**
 * Shares the authenticated workspace workflow between browser and desktop tests.
 * Each invocation registers a unique account and verifies durable UI state,
 * invalid-password handling, logout, and successful subsequent login.
 */
import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Runs the local account workflow on an already opened application page.
 * @param page - Browser or Electron renderer showing the application's root.
 * @returns Resolves when the user signs back in and sees persisted workspaces.
 */
export async function exerciseLocalIdentity(page: Page): Promise<void> {
  const email = `local-${randomUUID()}@example.test`;
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Alice");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Local testing password 42");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByText("Create a workspace to get started.")).toBeVisible();
  await page.getByLabel("Workspace name", { exact: true }).fill("Research");
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Research", exact: true })).toBeVisible();
  await page.getByLabel("Profile name", { exact: true }).fill("Alicia");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  const research = page.getByRole("article", { name: "Research", exact: true });
  await research.getByLabel("Rename Research", { exact: true }).fill("Research updated");
  await research.getByRole("button", { name: "Rename", exact: true }).click();
  const updated = page.getByRole("article", { name: "Research updated", exact: true });
  await expect(updated).toBeVisible();
  await updated.getByRole("button", { name: "Delete workspace", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Research updated?", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(updated).toBeVisible();
  await updated.getByRole("button", { name: "Delete workspace", exact: true }).click();
  // A rejected deletion must keep the confirmation open and allow an explicit retry.
  let rejectDeletion = true;
  await page.route("**/api/local", async (route) => {
    if (rejectDeletion && route.request().method() === "POST" && route.request().postDataJSON().action === "delete") {
      rejectDeletion = false;
      await route.fulfill({ status: 403, json: { error: "Deletion denied for this attempt." } });
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "Delete workspace", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Deletion denied for this attempt.");
  // Radix hides background content from accessibility queries while the modal remains open.
  await expect(page.getByRole("article", { name: "Research updated", exact: true, includeHidden: true })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Delete workspace", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(updated).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Profile name", { exact: true })).toHaveValue("Alicia");
  await page.getByRole("button", { name: "Restore Research updated", exact: true }).click();
  await expect(updated).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Research updated", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research updated", exact: true })).toHaveCount(0);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("region", { name: "Sign in", exact: true }).getByRole("alert")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("Local testing password 42");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Research updated", exact: true })).toBeVisible();
}
