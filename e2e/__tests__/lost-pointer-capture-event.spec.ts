import { expect, test } from "@playwright/test";
import type { ReactEditor } from "@chulane/rivto-react";

for (const mode of ["block", "edgeless"] as const) {
  test(`routes lost pointer capture as normalized input in ${mode}`, async ({ page }) => {
    await page.goto("/");
    if (mode === "edgeless") {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }
    const surface =
      mode === "edgeless"
        ? page.locator(".edgeless-viewport").first()
        : page.locator('[data-journal-document="today"] > .page-surface');
    await surface.evaluate((root) => {
      const state = window as unknown as {
        __rivtoDemo: { reactEditor: ReactEditor };
        lostCapture: unknown;
      };
      const button = document.createElement("button");
      button.textContent = "Capture test";
      button.dataset.editorControl = "";
      button.dataset.captureTest = "";
      button.style.cssText = "position:absolute;top:0;left:0;z-index:9999";
      button.addEventListener("pointerdown", (event) => button.setPointerCapture(event.pointerId));
      root.prepend(button);
      state.__rivtoDemo.reactEditor.events.register(
        { id: "capture-test.lost", type: "lostpointercapture", scope: "surface" },
        (event) => {
          const input = event.pointerInput;
          state.lostCapture = {
            type: input?.type,
            pointerId: input?.pointerId,
            targetMatches: input?.target?.hasAncestor("[data-capture-test]"),
            hasNativeEvent: !!input && "raw" in input,
          };
        },
      );
    });
    const button = surface.getByRole("button", { name: "Capture test" });
    const bounds = (await button.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.move(bounds.x + bounds.width / 2 + 1, bounds.y + bounds.height / 2);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { lostCapture: unknown }).lostCapture))
      .toEqual({
        type: "lostpointercapture",
        pointerId: expect.any(Number),
        targetMatches: true,
        hasNativeEvent: false,
      });
  });
}
