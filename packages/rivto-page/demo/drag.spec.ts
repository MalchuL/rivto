import { expect, test, type Page } from "@playwright/test";

/**
 * Starts real handle input and releases over an explicit row or column destination.
 *
 * @param page - Mounted demo browser page.
 * @param source - Stable source identity whose handle is visible after scrolling.
 * @param target - Actual parent accepting the dropped group.
 * @param beforeDrop - Optional measurement setup after scrolling and target resolution.
 * @returns A pointer gesture has completed; caller asserts model-backed DOM order.
 */
async function dragBlock(
  page: Page,
  source: string,
  target: string,
  beforeDrop?: () => Promise<void>,
): Promise<void> {
  const handle = page
    .locator(`[data-block-id="${source}"]`)
    .getByRole("button", { name: `Drag ${source}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2);
  const destination = target.startsWith("block-")
    ? page.locator(`[data-block-id="${target}"] > .rivto-block-row`)
    : page
        .locator(`[data-block-id="${target}"]`)
        .getByRole("button", { name: `Add card ${target}`, exact: true });
  await destination.scrollIntoViewIfNeeded();
  const to = (await destination.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2);
  await expect(page.locator("[data-block-drop-active]")).toHaveCount(1);
  await beforeDrop?.();
  await page.mouse.up();
}

test("moves a card and cancels a later handle gesture with Escape", async ({ page }) => {
  await page.goto("/?example=kanban");
  const source = "board-1-item-1-child-1";
  const target = "board-1-item-2";
  await dragBlock(page, source, target);
  await expect(page.locator(`[data-block-id="${target}"] [data-block-id="${source}"]`)).toHaveCount(
    1,
  );
  await expect(page.locator(`[data-block-id="${source}"]`)).toHaveAttribute(
    "data-block-selected",
    "true",
  );
  const handle = page
    .locator(`[data-block-id="${source}"]`)
    .getByRole("button", { name: `Drag ${source}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 5);
  await expect(page.locator(".rivto-block-drag-preview")).toHaveText("1 blocks");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".rivto-block-drag-preview")).toHaveCount(0);
  await expect(page.locator(`[data-block-id="${target}"] [data-block-id="${source}"]`)).toHaveCount(
    1,
  );
});

test("moves a selected group including an unmounted source from another parent", async ({
  page,
}) => {
  await page.goto("/?example=kanban&repeat=200&virtual");
  const first = "board-1-item-1-child-1";
  const last = "board-200-item-1-child-1";
  await page.locator(`[data-block-id="${first}"] strong`).click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  const middle = await page.locator("[data-virtual-block-id]").evaluateAll((roots) => {
    const visible = roots.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    return visible
      ?.querySelector('[data-block-id$="-item-1-child-1"]')
      ?.getAttribute("data-block-id");
  });
  expect(middle).toBeTruthy();
  await page.locator(`[data-block-id="${middle}"] strong`).click({ modifiers: ["Control"] });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(`[data-block-id="${last}"]`)).toBeVisible();
  await page.keyboard.down("Control");
  await page.locator(`[data-block-id="${last}"] strong`).click();
  await page.keyboard.up("Control");
  // Reconcile the window after replacing the previously pinned focus endpoint.
  await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
  await expect(page.locator(`[data-block-id="${middle}"]`)).toHaveCount(0);
  const target = "board-200-item-2";
  await dragBlock(page, last, target);
  const moved = page.locator(`[data-block-id="${target}"] [data-block-id]`);
  await expect(moved).toHaveCount(5);
  await expect(
    page.locator(`[data-block-id="${target}"] [data-block-id="${middle}"]`),
  ).toHaveAttribute("data-block-selected", "true");
  await expect(
    page.locator(`[data-block-id="${target}"] [data-block-id="${first}"]`),
  ).toHaveAttribute("data-block-selected", "true");
  await expect(
    page.locator(`[data-block-id="${target}"] [data-block-id="${last}"]`),
  ).toHaveAttribute("data-block-selected", "true");
});

test("detach removes active drag feedback and registrations work after remount", async ({
  page,
}) => {
  await page.goto("/?example=kanban");
  const source = "board-1-item-1-child-1";
  const handle = page
    .locator(`[data-block-id="${source}"]`)
    .getByRole("button", { name: `Drag ${source}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 5);
  await expect(page.locator(".rivto-block-drag-preview")).toHaveCount(1);
  const mounted = page.getByRole("checkbox", { name: "Editor mounted", exact: true });
  await mounted.evaluate((element: HTMLElement) => element.click());
  await page.mouse.up();
  await expect(page.locator(".rivto-block-drag-preview")).toHaveCount(0);
  await mounted.check();
  await dragBlock(page, source, "board-1-item-2");
  await expect(
    page.locator(`[data-block-id="board-1-item-2"] [data-block-id="${source}"]`),
  ).toHaveCount(1);
});

for (const example of ["outline", "kanban"]) {
  for (const { repeat, virtual } of [
    { repeat: 1, virtual: false },
    { repeat: 200, virtual: false },
    { repeat: 200, virtual: true },
  ]) {
    test(`@performance grouped drag ${example} repeat=${repeat} virtual=${virtual}`, async ({
      page,
    }) => {
      await page.goto(`/?example=${example}&repeat=${repeat}${virtual ? "&virtual" : ""}`);
      const source = example === "outline" ? "block-2" : "board-1-item-1-child-1";
      const second = example === "outline" ? "block-3" : "board-1-item-1-child-2";
      await page.locator(`[data-block-id="${source}"] strong`).click();
      await page.keyboard.down("Control");
      await page.locator(`[data-block-id="${second}"] strong`).click();
      await page.keyboard.up("Control");
      // Warm the root-to-child transition separately: replacing the root list
      // rebuilds virtualization's O(root count) list metadata. Samples below
      // compare equivalent child-to-child moves, without toolbar-induced scrolling.
      await dragBlock(page, source, example === "outline" ? "block-4" : "board-1-item-2");
      const samples: unknown[] = [];
      for (let index = 0; index < 5; index++) {
        const target =
          example === "outline"
            ? `block-${index % 2 === 0 ? 1 : 4}`
            : `board-1-item-${index % 2 === 0 ? 1 : 2}`;
        await dragBlock(page, source, target, async () => {
          await page
            .locator('section[aria-label="Statistics"]')
            .getByRole("button", { name: "Reset counters", exact: true })
            .evaluate((element: HTMLElement) => element.click());
          await page.evaluate(() => {
            document.documentElement.removeAttribute("data-drop-duration");
            window.addEventListener(
              "pointerup",
              () => {
                const start = performance.now();
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    document.documentElement.setAttribute(
                      "data-drop-duration",
                      String(performance.now() - start),
                    );
                  }),
                );
              },
              { capture: true, once: true },
            );
          });
        });
        await expect(
          page.locator(`[data-block-id="${target}"] [data-block-id="${source}"]`),
        ).toHaveCount(1);
        await expect(
          page.locator(`[data-block-id="${target}"] [data-block-id="${second}"]`),
        ).toHaveAttribute("data-block-selected", "true");
        await expect(page.locator("html")).toHaveAttribute("data-drop-duration", /.+/);
        const frameMs = Number(await page.locator("html").getAttribute("data-drop-duration"));
        await page
          .locator('section[aria-label="Statistics"]')
          .getByRole("button", { name: "Refresh statistics", exact: true })
          .click();
        const metrics = JSON.parse((await page.locator("[data-demo-metrics]").textContent())!);
        expect(metrics.nodeReads).toBeLessThan(150);
        expect(metrics.commandMs).toBeGreaterThanOrEqual(0);
        if (index > 0) {
          samples.push({ frameMs, commandMs: metrics.commandMs, reads: metrics.nodeReads });
        }
      }
      console.log(JSON.stringify({ example, repeat, virtual, samples }));
    });
  }
}

test("autoscrolls a held drag and stops after Escape", async ({ page }) => {
  await page.goto("/?example=kanban&repeat=200&virtual");
  const handle = page.getByRole("button", { name: "Drag board-1-item-1-child-1", exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(40, page.viewportSize()!.height - 5);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 80);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".rivto-block-drag-preview")).toHaveCount(0);
  const stopped = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(stopped);
});
