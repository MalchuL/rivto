import { expect, test, type Page } from "@playwright/test";
import type { BlockSelectionSnapshot } from "../src";

/**
 * Opens live selection diagnostics without changing default feature installations.
 *
 * @param page - Browser occurrence under test.
 * @returns Demo is mounted with diagnostic observation enabled.
 */
async function openSelection(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto("/");
  await page.getByText("Selection settings", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Inspect selection", exact: true }).check();
}

/**
 * Reads the host's published directed selection through the demo inspector.
 *
 * @param page - Mounted demo occurrence.
 * @returns Current coverage, or null without selection.
 */
async function selection(page: Page): Promise<BlockSelectionSnapshot | null> {
  return JSON.parse((await page.locator("[data-demo-selection]").textContent())!);
}

/**
 * Drags between the visible editable hosts with real pointer input.
 *
 * @param page - Mounted demo occurrence.
 * @param from - Origin block ID.
 * @param to - Destination block ID.
 * @returns Pointer gesture has completed across the two editable hosts.
 */
async function drag(page: Page, from: string, to: string): Promise<void> {
  const first = page.getByRole("textbox", { name: `Text ${from}`, exact: true });
  const last = page.getByRole("textbox", { name: `Text ${to}`, exact: true });
  await first.scrollIntoViewIfNeeded();
  const a = (await first.boundingBox())!;
  const b = (await last.boundingBox())!;
  await page.mouse.move(a.x + 25, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 55, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

test("publishes native caret and preserves text input", async ({ page }) => {
  await openSelection(page);
  const text = page.getByRole("textbox", { name: "Text block-1", exact: true });
  await text.click();
  await text.press("End");
  await expect
    .poll(async () => (await selection(page))?.blocks[0])
    .toEqual({ id: "block-1", start: 12, end: 12 });
  await text.press("x");
  await expect(text).toHaveText("Text block-1x");
});

test("selects structural anchors, dynamically rebinds toggle, and disables it independently", async ({
  page,
}) => {
  await openSelection(page);
  const first = page.locator('[data-block-id="block-1"] > .rivto-block-row strong').first();
  const second = page.locator('[data-block-id="block-2"] > .rivto-block-row strong').first();
  await first.click();
  await expect
    .poll(async () => (await selection(page))?.blocks)
    .toEqual([{ id: "block-1", start: 0, end: -1 }]);
  await page.getByRole("textbox", { name: "toggle binding", exact: true }).fill("a");
  await page.locator("[data-rivto-block-editor]").focus();
  await page.keyboard.down("a");
  await second.click();
  await page.keyboard.up("a");
  await expect
    .poll(async () => (await selection(page))?.blocks.map((block) => block.id))
    .toEqual(["block-1", "block-2"]);
  await page.getByRole("checkbox", { name: "toggle selection", exact: true }).uncheck();
  await page.locator("[data-rivto-block-editor]").focus();
  await page.keyboard.down("a");
  await first.click();
  await page.keyboard.up("a");
  await expect
    .poll(async () => (await selection(page))?.blocks.map((block) => block.id))
    .toEqual(["block-1"]);
});

test("extends structural ranges and excludes collapsed descendants", async ({ page }) => {
  await openSelection(page);
  await page.getByRole("checkbox", { name: "Collapsed block-1", exact: true }).check();
  await page.locator('[data-block-id="block-1"] strong').first().click();
  await page.keyboard.down("Shift");
  await page.locator('[data-block-id="block-2"] strong').first().click();
  await page.keyboard.up("Shift");
  await expect
    .poll(async () => (await selection(page))?.blocks.map((block) => block.id))
    .toEqual(["block-1", "block-2"]);
});

test("preserves reverse whole-block drag and exact text endpoints", async ({ page }) => {
  await openSelection(page);
  await drag(page, "child-0", "block-1");
  await expect.poll(async () => (await selection(page))?.anchorBlockId).toBe("child-0");
  await expect.poll(async () => (await selection(page))?.focusBlockId).toBe("block-1");
  expect((await selection(page))?.blocks.every((block) => block.end === -1)).toBe(true);
  await page.getByRole("textbox", { name: "exact binding", exact: true }).fill("Alt");
  await page.keyboard.down("Alt");
  await drag(page, "block-1", "child-0");
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await selection(page))?.focusBlockId).toBe("child-0");
  expect((await selection(page))?.blocks.every((block) => block.end >= 0)).toBe(true);
});

test("cancels active pointer selection on detach and allows remount", async ({ page }) => {
  await openSelection(page);
  const text = page.getByRole("textbox", { name: "Text block-1", exact: true });
  await text.scrollIntoViewIfNeeded();
  const box = (await text.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 15);
  await page.mouse.down();
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).uncheck();
  await page.mouse.up();
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).check();
  await text.click();
  await text.press("End");
  await expect.poll(async () => (await selection(page))?.blocks[0]?.id).toBe("block-1");
});

test("applies rebinding to the next drag while retaining the active binding", async ({ page }) => {
  await openSelection(page);
  const config = page.getByRole("textbox", { name: "exact binding", exact: true });
  await config.fill("Alt");
  const first = page.getByRole("textbox", { name: "Text block-1", exact: true });
  const last = page.getByRole("textbox", { name: "Text child-0", exact: true });
  await first.scrollIntoViewIfNeeded();
  const a = (await first.boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(a.x + 20, a.y + a.height / 2);
  await page.mouse.down();
  // fill changes host configuration without releasing the held pointer.
  await config.fill("Control");
  const reboundTarget = (await last.boundingBox())!;
  await page.mouse.move(reboundTarget.x + 40, reboundTarget.y + reboundTarget.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await selection(page))?.focusBlockId).toBe("child-0");
  expect((await selection(page))?.blocks.every((block) => block.end >= 0)).toBe(true);
  await first.click();
  await first.press("Home");
  await expect.poll(async () => (await selection(page))?.blocks.length).toBe(1);
  await page.keyboard.down("Alt");
  await drag(page, "block-1", "child-0");
  await page.keyboard.up("Alt");
  await expect
    .poll(async () => (await selection(page))?.blocks.every((block) => block.end === -1))
    .toBe(true);
});

test("scrolls during a held edge gesture and stops after pointer cancellation", async ({
  page,
}) => {
  await page.goto("/?repeat=200");
  await page.evaluate(() =>
    window.addEventListener(
      "pointerdown",
      (event) => {
        document.documentElement.dataset.testPointerId = String(event.pointerId);
      },
      { once: true },
    ),
  );
  const first = page.getByRole("textbox", { name: "Text block-1", exact: true });
  await first.scrollIntoViewIfNeeded();
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(box.x + 50, 715, { steps: 5 });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 50);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PointerEvent("pointercancel", {
        pointerId: Number(document.documentElement.dataset.testPointerId),
      }),
    ),
  );
  await page.mouse.up();
  const stopped = await page.evaluate(() => scrollY);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate(() => scrollY)).toBe(stopped);
});

for (const repeat of [1, 200]) {
  test(`bounds structural toggle work repeat=${repeat} @performance`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/?repeat=${repeat}`);
    const anchor = page.locator('[data-block-id="block-1"] strong').first();
    const samples: { commandMs: number; domMs: number; nodeReads: number }[] = [];
    for (let index = 0; index < 6; index++) {
      await page.getByRole("button", { name: "Reset counters", exact: true }).click();
      await anchor.scrollIntoViewIfNeeded();
      await anchor.evaluate((element) => {
        element.addEventListener(
          "pointerdown",
          () => {
            const start = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                element.setAttribute("data-selection-ms", String(performance.now() - start)),
              ),
            );
          },
          { once: true, capture: true },
        );
      });
      await page.keyboard.down("Control");
      await anchor.click();
      await page.keyboard.up("Control");
      if (index % 2 === 0) {
        await expect(page.locator('[data-block-id="block-1"]')).toHaveAttribute(
          "data-block-selected",
          "true",
        );
      } else {
        await expect(page.locator('[data-block-id="block-1"]')).not.toHaveAttribute(
          "data-block-selected",
          "true",
        );
      }
      await expect(anchor).toHaveAttribute("data-selection-ms", /\d/);
      await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
      const metrics = JSON.parse((await page.locator("[data-demo-metrics]").textContent())!);
      expect(metrics.blockIdsReads).toBe(0);
      expect(metrics.nodeReads).toBeLessThanOrEqual(24);
      if (index) {
        samples.push({
          commandMs: metrics.selectionCommandMs,
          domMs: Number(await anchor.getAttribute("data-selection-ms")),
          nodeReads: metrics.nodeReads,
        });
      }
    }
    console.log(
      `${testInfo.project.name} structural selection repeat=${repeat}: ${JSON.stringify(samples)}`,
    );
  });
}

test("limits held-key cursor feedback to the hovered anchor", async ({ page }) => {
  await page.goto("/");
  const first = page.getByRole("textbox", { name: "Text block-1", exact: true });
  await first.hover();
  await page.keyboard.down("Control");
  await expect(first).toHaveAttribute("data-block-selecting", "");
  await expect(page.locator("[data-block-selecting]")).toHaveCount(1);
  await page.keyboard.up("Control");
  await expect(page.locator("[data-block-selecting]")).toHaveCount(0);
});
