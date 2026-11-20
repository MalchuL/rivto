import { expect, test } from "@playwright/test";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`closes a TODO storage menu outside in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      page.setDefaultTimeout(7000);
      await page.goto(repeat ? `/?repeat=${repeat}` : "/");
      let storageId: string | undefined;
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').waitFor();
        storageId = await page.evaluate(() => {
          const editor = (
            window as unknown as {
              __rivtoDemo: {
                editor: {
                  blocks: {
                    /**
                     * Reads the current root block IDs.
                     *
                     * @returns Root IDs in document order.
                     */
                    getRootIds(): string[];
                    /**
                     * Resolves where to insert after an existing block.
                     *
                     * @param id - Block ID preceding the insertion.
                     * @returns Destination accepted by the block insertion operation.
                     */
                    getInsertionDestinationAfter(id: string): unknown;
                    /**
                     * Inserts a text block at the supplied destination.
                     *
                     * @param input - Block type and initial text.
                     * @param destination - Destination resolved by the block manager.
                     * @returns The inserted block's identity.
                     */
                    insertBlock(
                      input: { type: string; content: string },
                      destination: unknown,
                    ): { id: string };
                  };
                };
              };
            }
          ).__rivtoDemo.editor;
          const first = editor.blocks.getRootIds()[0]!;
          return editor.blocks.insertBlock(
            { type: "todo-storage", content: "" },
            editor.blocks.getInsertionDestinationAfter(first),
          ).id;
        });
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const storage = storageId
        ? page.locator(`[data-journal-document="today"] [data-block-id="${storageId}"]`)
        : page.locator('[data-journal-document="today"] [data-block-type="todo-storage"]').first();
      await storage.scrollIntoViewIfNeeded();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const menu = page.getByRole("dialog", { name: "Filters" });
      const search = storage.getByRole("searchbox", { name: "Search TODOs" });
      const samples: { sync: number; rendered: number }[] = [];
      await page.evaluate(() => {
        const win = window as unknown as Window & { menuRecording?: boolean; menuStart?: number };
        window.addEventListener(
          "pointerdown",
          () => {
            if (win.menuRecording) {
              win.menuStart = performance.now();
            }
          },
          true,
        );
      });
      for (let index = 0; index < 4; index += 1) {
        await storage.getByText("Filter", { exact: true }).click();
        await expect(menu).toBeVisible();
        await page.evaluate(() => {
          const win = window as unknown as Window & {
            menuRecording?: boolean;
            menuStart?: number;
            menuTiming?: { sync: number; rendered: number };
          };
          win.menuTiming = undefined;
          document.addEventListener(
            "pointerdown",
            () => {
              const start = win.menuStart!;
              const sync = performance.now() - start;
              win.menuRecording = false;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  win.menuTiming = { sync, rendered: performance.now() - start };
                }),
              );
            },
            { capture: true, once: true },
          );
          win.menuRecording = true;
        });
        await search.click();
        await expect(menu).toHaveCount(0);
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as Window & { menuTiming?: unknown }).menuTiming,
            ),
          )
          .toBeDefined();
        const timing = await page.evaluate(
          () =>
            (window as unknown as Window & { menuTiming: { sync: number; rendered: number } })
              .menuTiming,
        );
        if (index > 0) {
          samples.push(timing);
        }
      }
      console.log(JSON.stringify({ interaction: "todo-storage-menu", mode, repeat, samples }));
    });
  }
}
