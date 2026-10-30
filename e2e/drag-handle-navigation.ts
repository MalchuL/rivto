import { expect, type Page } from "@playwright/test";

/**
 * Returns to the document when a native handle click opened the dragged block.
 *
 * A captured release or release after Escape can activate the handle's ordinary
 * navigation. Persisted-order assertions remain independent of that navigation;
 * this helper restores the original scope for subsequent control and undo checks.
 * Navigation to any unrelated block fails instead of being silently dismissed.
 *
 * @param page - Demo page after pointer release and its native click delivery.
 * @param blockId - Source whose handle may have received the browser's click.
 * @returns Resolves with whether breadcrumb navigation restored the document.
 * @throws If another block opened or breadcrumb navigation cannot restore the document.
 */
export async function returnToDocumentAfterNativeHandleClick(page: Page, blockId: string) {
  const today = page.locator('[data-journal-document="today"]');
  const header = today.locator(".demo-panel-header");
  const active = await header.getAttribute("data-panel-root");
  expect(["", blockId]).toContain(active);
  if (active !== blockId) {
    return false;
  }
  await today
    .getByRole("navigation", { name: "Panel breadcrumbs" })
    .getByRole("button")
    .first()
    .click();
  await expect(header).toHaveAttribute("data-panel-root", "");
  return true;
}
