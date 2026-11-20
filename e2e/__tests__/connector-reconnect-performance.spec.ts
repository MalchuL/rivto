import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`reconnects an endpoint with live feedback, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await page.locator(".edgeless-viewport").evaluate((element) => element.scrollIntoView());
    const ids = await createConnector(page);
    const target = page.locator(`[data-edgeless-object-id="${ids.target}"]`);
    const bounds = (await target.boundingBox())!;
    const endpoint = page
      .locator(`[data-edgeless-object-id="${ids.connector}"]`)
      .getByRole("button", { name: "Reconnect target" });
    await expect(endpoint).toBeVisible();
    const start = (await endpoint.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2);
    const samples = [];
    for (const offset of [20, 30, 40]) {
      samples.push(
        await measurePointer(page, () =>
          page.mouse.move(bounds.x + bounds.width - offset, bounds.y + bounds.height / 2),
        ),
      );
      await expect(page.locator("[data-edgeless-connector-anchors]")).toHaveAttribute(
        "data-edgeless-connector-anchors",
        ids.target,
      );
    }
    console.log(JSON.stringify({ interaction: "connector-reconnect", repeat, samples }));
    await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height / 2);
    await page.mouse.up();
    const endpointTarget = await page.evaluate(
      (id) =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.elements.getElementNode(id)!.props.target,
      ids.connector,
    );
    expect(endpointTarget).toMatchObject({ elementId: ids.target, anchor: { x: 1, y: 0.5 } });
  });
}

/**
 * Creates a selected connector attached to a rectangle in the demo document.
 *
 * @param page - Demo page with an active edgeless editor.
 * @returns IDs of the target and selected connector.
 */
async function createConnector(page: Page) {
  return page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const target = editor.elements.insertElement({
      type: "rectangle",
      frame: { x: 300, y: 150, width: 160, height: 100 },
      zIndex: 10000,
    }).id;
    const connector = editor.elements.insertElement({
      type: "connector",
      frame: { x: 100, y: 200, width: 200, height: 1 },
      props: {
        source: { anchor: { x: 0.5, y: 0.5 }, position: { x: 100, y: 200 } },
        target: { elementId: target, anchor: { x: 0, y: 0.5 }, position: { x: 300, y: 200 } },
      },
      zIndex: 10001,
    }).id;
    editor.commands.execute("edgeless.selection.set", [connector]);
    return { target, connector };
  });
}

/**
 * Measures a real pointer move through synchronous listeners and two render frames.
 *
 * @param page - Warm demo with a connector endpoint captured.
 * @param action - Mouse movement to measure.
 * @returns Synchronous event and two-frame durations in milliseconds.
 */
async function measurePointer(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    const state = window as unknown as { reconnectTiming: null | { sync: number; frames: number } };
    state.reconnectTiming = null;
    let start = 0;
    window.addEventListener(
      "pointermove",
      () => {
        start = performance.now();
      },
      { capture: true, once: true },
    );
    const stop = Event.prototype.stopPropagation;
    Event.prototype.stopPropagation = function () {
      stop.call(this);
      if (this.type !== "pointermove") {
        return;
      }
      Event.prototype.stopPropagation = stop;
      queueMicrotask(() => {
        const sync = performance.now() - start;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.reconnectTiming = { sync, frames: performance.now() - start };
          }),
        );
      });
    };
  });
  await action();
  await page.waitForFunction(
    () => (window as unknown as { reconnectTiming: unknown }).reconnectTiming !== null,
  );
  return page.evaluate(
    () =>
      (window as unknown as { reconnectTiming: { sync: number; frames: number } }).reconnectTiming,
  );
}
