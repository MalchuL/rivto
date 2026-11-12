import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "@chulane/rivto-react";

/** Browser observations for an interrupted indent settlement. */
interface IndentMemoryWindow extends Window {
  readonly __rivtoDemo: {
    readonly editor: DocumentEditorAPI;
    readonly reactEditor: ReactEditorApi;
  };
  readonly settlementWheels: Set<EventListenerOrEventListenerObject>;
  readonly cancelledFrames: number[];
  settlementPaused: boolean;
  oldPageRoot: HTMLElement;
}

/**
 * Records later wheel listeners and pauses animation frames after settlement begins.
 *
 * @returns The next indent can enter, but cannot finish, viewport settlement.
 */
function pauseSettlementFrames(): void {
  const host = window as unknown as IndentMemoryWindow;
  const wheels = new Set<EventListenerOrEventListenerObject>();
  Object.assign(host, { settlementWheels: wheels, settlementPaused: false, cancelledFrames: [] });
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  const request = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  window.cancelAnimationFrame = (id) => {
    host.cancelledFrames.push(id);
    cancel(id);
  };
  window.addEventListener = (type, listener, options) => {
    if (type === "wheel" && listener) {
      wheels.add(listener);
    }
    add(type, listener, options);
  };
  window.removeEventListener = (type, listener, options) => {
    if (type === "wheel" && listener) {
      wheels.delete(listener);
    }
    remove(type, listener, options);
  };
  let paused = false;
  window.requestAnimationFrame = (callback) => {
    if (paused) {
      return 2_147_483_000;
    }
    return request((time) => {
      callback(time);
      if (wheels.size) {
        paused = true;
        host.settlementPaused = true;
      }
    });
  };
}

for (const action of ["destroy", "replace"] as const) {
  test(`${action} releases an interrupted indent settlement`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.getByRole("checkbox", { name: "Virtualize page" }).check();
    await page.getByRole("spinbutton", { name: "Virtualize after roots count" }).fill("");
    const target = page.locator("[data-block-content]").nth(1);
    await target.click();
    const id = await target.evaluate((element) => {
      (window as unknown as IndentMemoryWindow).oldPageRoot =
        element.closest<HTMLElement>(".page-surface")!;
      return element.closest<HTMLElement>("[data-block-id]")!.dataset.blockId!;
    });
    await page.evaluate(pauseSettlementFrames);
    await page.keyboard.press("Tab");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as IndentMemoryWindow).settlementPaused))
      .toBe(true);
    await page.waitForTimeout(100);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as IndentMemoryWindow).settlementWheels.size),
      )
      .toBe(1);
    const result = await page.evaluate(
      async ({ blockId, action }) => {
        const host = window as unknown as IndentMemoryWindow;
        const parent = host.__rivtoDemo.editor.blocks.getParentId(blockId);
        if (action === "destroy") {
          await host.__rivtoDemo.reactEditor.destroy();
        } else {
          document.querySelector<HTMLButtonElement>('[data-editor-mode="edgeless"]')!.click();
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return {
          parent,
          remaining: host.settlementWheels.size,
          cancelled: host.cancelledFrames,
          pageRoot: host.oldPageRoot.isConnected,
        };
      },
      { blockId: id, action },
    );
    expect(result.parent).toBeTruthy();
    if (action === "replace") {
      expect(result.pageRoot).toBe(false);
    }
    expect(result.remaining).toBe(0);
    expect(result.cancelled).toContain(2_147_483_000);
  });
}
