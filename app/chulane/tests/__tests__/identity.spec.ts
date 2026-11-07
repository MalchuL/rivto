/**
 * Exercises local registration and workspace operations through the shared UI.
 * Browser cookies establish the acting identity, reload verifies durable state,
 * and signing out removes access before another password login restores it.
 */
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { exerciseLocalIdentity } from "./identity-flow";

/** @param fixtures - Isolated browser page. @returns Resolves after the complete local user workflow. */
test("registers, creates a workspace, reloads, and signs back in with a password", async ({ page }) => {
  await page.goto("/");
  await exerciseLocalIdentity(page);
  await page.screenshot({ path: test.info().outputPath("workspaces.png"), fullPage: true });
});

/** @param fixtures - Browser context owner and primary page. @returns Resolves after role changes are reflected in both users' UI. */
test("owners manage members while viewers cannot change workspace settings", async ({ page, browser }) => {
  const secondContext = await browser.newContext();
  const bobPage = await secondContext.newPage();
  const suffix = randomUUID();
  try {
    for (const [target, name] of [[bobPage, "Bob"], [page, "Alice"]] as const) {
      await target.goto("http://127.0.0.1:3017/");
      await target.getByRole("button", { name: "Create an account", exact: true }).click();
      await target.getByLabel("Name", { exact: true }).fill(`${name}-${suffix}`);
      await target.getByLabel("Email", { exact: true }).fill(`${name}-${suffix}@example.test`);
      await target.getByLabel("Password", { exact: true }).fill("Local testing password 42");
      await target.getByRole("button", { name: "Register", exact: true }).click();
      await expect(target.getByText("Create a workspace to get started.")).toBeVisible();
    }
    await page.getByLabel("Workspace name", { exact: true }).fill("Team");
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    const team = page.getByRole("article", { name: "Team", exact: true });
    await team.getByLabel("Member", { exact: true }).selectOption({ label: `Bob-${suffix}` });
    await team.getByLabel("Role", { exact: true }).selectOption("viewer");
    await team.getByRole("button", { name: "Save member", exact: true }).click();
    await expect(team.getByText(`Bob-${suffix} · viewer`, { exact: true })).toBeVisible();
    await bobPage.reload();
    const bobTeam = bobPage.getByRole("article", { name: "Team", exact: true });
    await expect(bobTeam.getByText("Workspace · viewer", { exact: true })).toBeVisible();
    await expect(bobTeam.getByRole("button", { name: "Rename", exact: true })).toHaveCount(0);
    await team.getByRole("button", { name: `Remove Alice-${suffix} from Team`, exact: true }).click();
    await expect(page.getByRole("region", { name: "Workspaces", exact: true }).getByRole("alert")).toHaveText("Cannot remove or demote the last owner.");
    await expect(page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: "Cannot remove or demote the last owner." })).toBeVisible();
    await team.getByRole("button", { name: `Remove Bob-${suffix} from Team`, exact: true }).click();
    await expect(team.getByText(`Bob-${suffix} · viewer`, { exact: true })).toHaveCount(0);
    await bobPage.reload();
    await expect(bobPage.getByRole("article", { name: "Team", exact: true })).toHaveCount(0);
  } finally { await secondContext.close(); }
});
