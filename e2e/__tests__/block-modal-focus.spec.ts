import { expect, test } from "@playwright/test";

for (const mode of ["page", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`restores Bento focus after closing in ${mode}, repeat=${repeat}`, async ({ page }) => {
      await page.goto(`/?repeat=${repeat}`);
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').first().click();
      }
      const board = page.locator('[data-block-type="bento"]').first();
      const expand = board.getByRole("button", { name: "Expand Bento", exact: true });
      await expand.scrollIntoViewIfNeeded();
      for (let iteration = 0; iteration < 3; iteration += 1) {
        await expand.click();
        const dialog = page.getByRole("dialog", { name: "Expanded Bento", exact: true });
        await expect(dialog).toBeVisible();
        const collapse = dialog.getByRole("button", { name: "Collapse Bento", exact: true });
        await collapse.evaluate((button) => {
          button.addEventListener(
            "click",
            () => {
              const start = performance.now();
              window.addEventListener(
                "click",
                () => {
                  document.documentElement.dataset.modalCloseSync = String(
                    performance.now() - start,
                  );
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => {
                      document.documentElement.dataset.modalCloseRendered = String(
                        performance.now() - start,
                      );
                    }),
                  );
                },
                { once: true },
              );
            },
            { capture: true, once: true },
          );
        });
        await collapse.click();
        await expect(dialog).toHaveCount(0);
        await expect(expand).toBeFocused();
        await expect(page.locator("html")).toHaveAttribute("data-modal-close-rendered", /.+/);
        const sample = await page.locator("html").evaluate((root) => ({
          sync: root.dataset.modalCloseSync,
          rendered: root.dataset.modalCloseRendered,
        }));
        console.log(`modal focus ${mode} repeat=${repeat}: ${JSON.stringify(sample)}`);
        await page.locator("html").evaluate((root) => {
          delete root.dataset.modalCloseRendered;
          delete root.dataset.modalCloseSync;
        });
      }
    });
  }
}
