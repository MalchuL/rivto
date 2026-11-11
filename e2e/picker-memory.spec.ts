import { expect, test } from "@playwright/test";
import type { ReactEditorApi } from "@chulane/rivto-react";

/** References used to observe cancelled native picker inputs. */
interface PickerMemoryWindow extends Window {
  readonly __rivtoDemo: { readonly reactEditor: ReactEditorApi };
  readonly pickerRefs: WeakRef<HTMLInputElement>[];
}

for (const kind of ["file", "image"] as const) {
  test(`collects cancelled ${kind} picker inputs while the extension stays mounted`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "The forced garbage collection protocol is Chromium-only",
    );
    await page.addInitScript(() => {
      const host = window as unknown as PickerMemoryWindow;
      const pickerRefs: WeakRef<HTMLInputElement>[] = [];
      Object.assign(host, { pickerRefs });
      const click = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        if (this.type === "file") {
          pickerRefs.push(new WeakRef(this));
        } else {
          click.call(this);
        }
      };
    });
    await page.goto("/?test_features=1");
    await expect(page.locator(".page-surface").first()).toBeVisible();
    await page.evaluate((command) => {
      const host = window as unknown as PickerMemoryWindow;
      const panel = host.__rivtoDemo.reactEditor.panels.getDefault()!;
      const blockId = panel.blocks.getRootIds()[0]!;
      for (let index = 0; index < 100; index++) {
        panel.slashCommands.execute(`${command}.insert`, { blockId });
      }
    }, kind);
    expect(
      await page.evaluate(() => (window as unknown as PickerMemoryWindow).pickerRefs.length),
    ).toBe(100);
    const session = await page.context().newCDPSession(page);
    await expect
      .poll(async () => {
        await session.send("HeapProfiler.collectGarbage");
        return page.evaluate(
          () =>
            (window as unknown as PickerMemoryWindow).pickerRefs.filter((reference) =>
              reference.deref(),
            ).length,
        );
      })
      .toBe(0);
    await session.detach();
  });
}
