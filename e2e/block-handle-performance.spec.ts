import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

type Measurement = { sync: number; rendered: number; start: number };
type Runtime = { __rivtoDemo: { editor: DocumentEditorAPI }; __handleMeasurement: Measurement };

for (const repeat of [0, 200]) {
  test(`measures context-menu collapse and expand, repeat=${repeat}`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    const id = await page.evaluate(() => {
      const runtime = window as unknown as Runtime;
      const blocks = runtime.__rivtoDemo.editor.blocks;
      const id = blocks.getRootIds().find((id) => blocks.getBlockNode(id)!.childIds.length > 0)!;
      const update = blocks.updateBlocks.bind(blocks);
      blocks.updateBlocks = (...args) => {
        const start = performance.now();
        const result = update(...args);
        runtime.__handleMeasurement.sync += performance.now() - start;
        return result;
      };
      document.addEventListener(
        "click",
        (event) => {
          if (!(event.target as Element).closest('[role="menuitem"]')) {
            return;
          }
          runtime.__handleMeasurement = { sync: 0, start: performance.now(), rendered: 0 };
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              runtime.__handleMeasurement.rendered =
                performance.now() - runtime.__handleMeasurement.start;
            }),
          );
        },
        true,
      );
      return id;
    });
    const samples: Omit<Measurement, "start">[] = [];
    const row = page
      .locator(
        `[data-journal-document="today"] [data-block-id="${id}"] > .rivto-block-row`,
      )
      .first();
    for (let index = 0; index < 6; index++) {
      await row.hover();
      await row.locator(".block-handle").click({ button: "right" });
      const collapsed = index % 2 === 0;
      await page
        .getByRole("menuitem", {
          name: collapsed ? "Collapse subtree" : "Expand whole subtree",
          exact: true,
        })
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              (window as unknown as Runtime).__rivtoDemo.editor.blocks.getBlockNode(id)?.listProps
                .collapsed,
            id,
          ),
        )
        .toBe(collapsed);
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as Runtime).__handleMeasurement.rendered),
        )
        .toBeGreaterThan(0);
      if (index > 1) {
        samples.push(
          await page.evaluate(() => {
            const { sync, rendered } = (window as unknown as Runtime).__handleMeasurement;
            return { sync, rendered };
          }),
        );
      }
    }
    console.log(JSON.stringify({ browserName, repeat, samples }));
  });
}
