import { expect, test, type Page } from "@playwright/test";
import type { VirtualSelectionWindow } from "./types";

for (const repeat of [0, 200]) {
  test(`checks a missing virtualized selection endpoint, repeat=${repeat}`, async ({
    page,
    browserName,
  }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.getByRole("checkbox", { name: "Virtualize page" }).check();
    await page.getByRole("spinbutton", { name: "Virtualize after roots count" }).fill("0");
    const content = page
      .locator('[data-journal-document="today"] [data-block-id] [data-block-content]')
      .first();
    await content.click();
    const id = await content
      .locator("xpath=ancestor::*[@data-block-id][1]")
      .getAttribute("data-block-id");
    expect(id).toBeTruthy();
    await expect
      .poll(() =>
        page.evaluate((anchorBlockId) => {
          const panel = (
            window as unknown as VirtualSelectionWindow
          ).__rivtoDemo.reactEditor.panels.getDefault();
          return panel?.page.browserSelection.hasVirtualizedMissingEndpoints({
            type: "selection",
            blocks: [],
            anchorBlockId: anchorBlockId!,
            focusBlockId: "missing-benchmark-endpoint",
          });
        }, id),
      )
      .toBe(true);
    const samples = await measureLookup(page, id!);
    await expect(content).toBeFocused();
    console.log(JSON.stringify({ browserName, repeat, operations: 100, samples }));
  });
}

/**
 * Measures repeated lookup of an unmounted selection endpoint.
 *
 * @param page - Demo with virtualization enabled and an active panel.
 * @param id - Mounted anchor block identity.
 * @returns Three elapsed times for 100 successful missing-endpoint checks each.
 * @throws If a lookup unexpectedly reports that both endpoints are mounted.
 */
async function measureLookup(page: Page, id: string): Promise<number[]> {
  return page.evaluate((anchorBlockId) => {
    const panel = (
      window as unknown as VirtualSelectionWindow
    ).__rivtoDemo.reactEditor.panels.getDefault()!;
    const selection = {
      type: "selection" as const,
      blocks: [] as [],
      anchorBlockId: anchorBlockId!,
      focusBlockId: "missing-benchmark-endpoint",
    };
    const result: number[] = [];
    for (let sample = 0; sample < 3; sample++) {
      const start = performance.now();
      for (let index = 0; index < 100; index++) {
        if (!panel.page.browserSelection.hasVirtualizedMissingEndpoints(selection)) {
          throw new Error("Expected a missing virtualized endpoint");
        }
      }
      result.push(performance.now() - start);
    }
    return result;
  }, id);
}
