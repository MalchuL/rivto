import { expect, test } from "@playwright/test";

test("renders a visible rule for Markdown quotes in page and canvas", async ({ page }) => {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  for (const mode of ["Page", "Edgeless"]) {
    if (mode === "Edgeless") {
      await page.getByRole("button", { name: mode, exact: true }).click();
    }
    const block = today.locator(".markdown-content").filter({
      hasText: "Last time we saw a kingfisher",
    });
    const quote = block.locator(".markdown-preview blockquote");
    await expect(quote).toBeVisible();
    await expect(quote).toHaveCSS("border-left-style", "solid");
    await expect(quote).toHaveCSS("border-left-width", "3px");
    await expect(quote).toHaveCSS("margin-left", "0px");
    const editor = block.locator(".markdown-editor");
    await editor.click();
    await expect(editor).toContainText("> Last time we saw a kingfisher");
    await editor.blur();
    await expect(quote).toBeVisible();
  }
});
