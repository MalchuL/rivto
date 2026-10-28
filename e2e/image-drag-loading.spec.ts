/** Browser regression coverage for image loading feedback after file drops. */
import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`dropping an image avoids a loading flash in ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const target = page
        .locator(mode === "block" ? ".page-surface" : ".edgeless-viewport")
        .first();
      await page.evaluate(() => {
        const state = window as unknown as { loadingSeen: boolean; observer: MutationObserver };
        state.loadingSeen = false;
        state.observer = new MutationObserver((records) => {
          if (
            records.some((record) =>
              [...record.addedNodes].some((node) => node.textContent?.includes("Loading image")),
            )
          ) {
            state.loadingSeen = true;
          }
        });
        state.observer.observe(document.body, { childList: true, subtree: true });
      });
      const dropStart = Date.now();
      await target.evaluate((element) => {
        const data = new DataTransfer();
        const bytes = Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          ),
          (character) => character.charCodeAt(0),
        );
        data.items.add(new File([bytes], "test.png", { type: "image/png" }));
        const event = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: 300,
          clientY: 300,
        });
        Object.defineProperty(event, "dataTransfer", { value: data });
        element.dispatchEvent(event);
      });
      const selector =
        mode === "block"
          ? '[data-block-type="image"] .rivto-image'
          : '[data-edgeless-visual-kind="image"] .rivto-image';
      await expect(page.locator(selector)).toBeVisible({ timeout: 30000 });
      console.log(JSON.stringify({ mode, repeat, dropToImageMs: Date.now() - dropStart }));
      expect(
        await page.evaluate(() => (window as unknown as { loadingSeen: boolean }).loadingSeen),
      ).toBe(false);
    });
  }
}

test("slow image resolution shows loading and retains failure feedback", async ({ page }) => {
  await page.route("**/__rivto_demo_local_file**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ status: 404 });
  });
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.blocks.insertBlock({
      id: "slow-image",
      type: "image",
      props: {
        uri: "/tmp/missing.png",
        alt: "missing",
        name: "missing.png",
        mimeType: "image/png",
      },
    });
  });
  const image = page.locator('[data-block-id="slow-image"]');
  await expect(image.getByRole("status")).toHaveText("Loading image…");
  await expect(image.getByRole("alert")).toHaveText(
    "The pasted local file is unavailable to the demo server",
  );
});
