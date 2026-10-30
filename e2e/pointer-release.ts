import type { Page } from "@playwright/test";

/**
 * Hides a trusted native release from all editor listeners while preserving mouse state.
 *
 * The listener is installed before the application mounts. It simulates a release
 * unavailable to the editor; the next real pointermove still reports buttons=0.
 * Other UI clicks retain their normal delivery.
 *
 * @param page - Isolated page whose subsequent navigation installs the fixture.
 * @returns Resolves when the pre-application listener has been registered.
 * @throws If the browser rejects the initialization script.
 */
export async function loseHandleRelease(page: Page) {
  await page.addInitScript(() => {
    let heldHandle = false;
    window.addEventListener(
      "pointerdown",
      (event) => {
        heldHandle =
          event.target instanceof Element && !!event.target.closest("[data-block-drag-handle]");
      },
      true,
    );
    window.addEventListener(
      "pointerup",
      (event) => {
        if (heldHandle) {
          heldHandle = false;
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  });
}
