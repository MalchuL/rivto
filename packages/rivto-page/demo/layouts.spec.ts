import { test, expect, type Page, type Locator } from "@playwright/test";
import type { DemoMetrics } from "./demo-adapter";

for (const example of ["kanban", "bento"]) {
  test(`${example} owns JSX order, preserves content and works without demo CSS`, async ({
    page,
  }) => {
    await page.goto(`/?example=${example}`);
    await expect(page.locator("[data-block-id]")).toHaveCount(example === "kanban" ? 10 : 7);
    const board = page.locator('[data-block-id="board-1"]');
    const regions = await board.evaluate((element) =>
      [...element.children].map((child) => child.className),
    );
    expect(regions[example === "kanban" ? 0 : regions.length - 1]).toContain("rivto-block-row");
    const textId = example === "kanban" ? "board-1-item-1-child-1" : "board-1-item-1";
    const text = page.getByRole("textbox", { name: `Text ${textId}`, exact: true });
    await text.fill("Preserved text");
    if (example === "bento") {
      await page.getByLabel("Tile width board-1-item-1", { exact: true }).selectOption("360");
      await expect(page.locator('[data-demo-tile="board-1-item-1"]')).toHaveCSS("width", "360px");
    } else {
      await page.getByRole("button", { name: "Add column board-1", exact: true }).click();
      await expect(page.locator('[data-block-type="demo-column"]')).toHaveCount(4);
      await page.getByRole("button", { name: "Add card board-1-added-4", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "Text board-1-added-4-added-1", exact: true }),
      ).toBeVisible();
    }
    await expect(text).toHaveText("Preserved text");
    await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
    await page.locator("style[data-demo-chrome]").evaluate((element) => element.remove());
    const children = board.locator(":scope > .rivto-block-children");
    await expect(children).toHaveCSS("display", "flex");
    await expect(children).toHaveCSS("flex-direction", "row");
    await expect(children).toHaveCSS("margin-inline-start", "0px");
    await expect(board.locator(":scope > .rivto-block-row")).toHaveCSS("padding-top", "16px");
  });
}

test("chooses live canonical gaps, respects clipping, and clears targets after view unmount", async ({
  page,
}) => {
  await page.goto("/?example=kanban");
  await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).check();
  const gap = page.locator('[data-drop-gap="board-1"]').first();
  await gap.hover();
  const output = page.locator("[data-demo-drop-output]");
  await expect(output).toHaveText(
    JSON.stringify({
      kind: "between",
      parentId: "board-1",
      previousId: null,
      nextId: "board-1-item-1",
    }),
  );
  await page.getByRole("button", { name: "Add column board-1", exact: true }).click();
  const body = page.locator('[data-block-id="board-1"] > .rivto-block-children');
  const rect = await body.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width + 3, rect!.y + 20);
  await expect(output).toHaveText("");
  await body.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await page.locator('[data-drop-gap="board-1"]').last().hover();
  await expect(output).toContainText('"previousId":"board-1-added-4"');
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).uncheck();
  await page.mouse.move(10, 10);
  await expect(output).toHaveText("");
  await expect(page.locator("[data-demo-drop-overlay]")).toBeHidden();
});

test("preserves list counter ownership across item wrappers and wrapper boundaries", async ({
  page,
}) => {
  await page.goto("/?example=bento");
  const first = "board-1-item-1";
  const second = "board-1-item-2";
  await page.getByLabel(`List type ${first}`, { exact: true }).selectOption("");
  await page.getByLabel(`List type ${second}`, { exact: true }).selectOption("numbered_list");
  await expect(page.locator(`[data-demo-tile="${second}"]`)).toHaveCSS(
    "counter-set",
    "rivto-list-number 1",
  );
  await expect(page.locator(`[data-block-id="${second}"]`)).toHaveCSS("counter-increment", "none");
  await page.getByLabel(`List type ${first}`, { exact: true }).selectOption("start_numbered_list");
  await page
    .getByLabel(`List type ${second}`, { exact: true })
    .selectOption("continue_numbered_list");
  await expect(page.locator(`[data-demo-tile="${first}"]`)).toHaveCSS(
    "counter-set",
    "rivto-list-number 1",
  );
  await expect(page.locator(`[data-demo-tile="${second}"]`)).toHaveCSS(
    "counter-increment",
    "rivto-list-number 1",
  );
});

test("wrapper boundaries preserve cells and canonical destinations across row wrapping and resizing", async ({
  page,
}) => {
  await page.goto("/?example=bento");
  const host = page.locator('[data-block-id="board-1"] > .rivto-block-children');
  await host.evaluate((element) => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "repeat(2, max-content)";
  });
  await expect(host.locator(":scope > .rivto-block-item")).toHaveCount(4);
  const unchanged = await host.evaluate((element) => {
    const tiles = [...element.children];
    const rectangles = () =>
      tiles.map((tile) => JSON.stringify(tile.getBoundingClientRect().toJSON()));
    const before = rectangles();
    const gaps = element.querySelectorAll<HTMLElement>(".rivto-block-drop-wrapper-boundary");
    gaps.forEach((gap) => {
      gap.hidden = true;
    });
    const after = rectangles();
    gaps.forEach((gap) => {
      gap.hidden = false;
    });
    return JSON.stringify(before) === JSON.stringify(after);
  });
  expect(unchanged).toBe(true);
  await expect(page.locator(".rivto-block-drop-wrapper-boundary")).toHaveCount(16);
  const first = page.locator('[data-demo-tile="board-1-item-1"]');
  const third = page.locator('[data-demo-tile="board-1-item-3"]');
  expect((await third.boundingBox())!.y).toBeGreaterThan((await first.boundingBox())!.y);
  await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).check();
  await expectTileGap(page, 1, "before", "block", null, "board-1-item-1");
  await expectTileGap(page, 1, "before", "inline", null, "board-1-item-1");
  await expectTileGap(page, 1, "after", "inline", "board-1-item-1", "board-1-item-2");
  await expectTileGap(page, 2, "after", "inline", "board-1-item-2", "board-1-item-3");
  await expectTileGap(page, 3, "before", "block", "board-1-item-2", "board-1-item-3");
  await expectTileGap(page, 3, "before", "inline", "board-1-item-2", "board-1-item-3");
  await expectTileGap(page, 4, "after", "block", "board-1-item-4", null);
  await page.getByLabel("Tile width board-1-item-1", { exact: true }).selectOption("360");
  await expect(first).toHaveCSS("width", "360px");
  await expectTileGap(page, 1, "after", "inline", "board-1-item-1", "board-1-item-2");
  await host.evaluate((element) => {
    element.style.gridTemplateColumns = "max-content";
  });
  await expectTileGap(page, 2, "before", "block", "board-1-item-1", "board-1-item-2");
  await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
  await page.locator("style[data-demo-chrome]").evaluate((element) => element.remove());
  await expectTileGap(page, 3, "before", "inline", "board-1-item-2", "board-1-item-3");
});

test("wrapper boundaries use package theme geometry, respect clipping, and disappear on collapse and unmount", async ({
  page,
}) => {
  await page.goto("/?example=bento");
  const host = page.locator('[data-block-id="board-1"] > .rivto-block-children');
  await host.evaluate((element) => {
    element.style.setProperty("--rivto-block-gap", "24px");
    element.style.setProperty("--rivto-drop-gap-size", "20px");
    element.style.overflow = "hidden";
  });
  const gap = page.locator(
    '[data-demo-tile="board-1-item-1"] > [data-drop-placement="before"][data-drop-edge="inline"]',
  );
  await expect(gap).toHaveCSS("width", "20px");
  await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).check();
  const bounds = (await host.boundingBox())!;
  await page.mouse.move(bounds.x - 1, bounds.y + 30);
  await expect(page.locator("[data-demo-drop-output]")).toHaveText("");
  await page.getByRole("button", { name: "Collapse board-1", exact: true }).click();
  await expect(page.locator(".rivto-block-drop-wrapper-boundary")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand board-1", exact: true }).click();
  await expect(page.locator(".rivto-block-drop-wrapper-boundary")).toHaveCount(16);
  await expectTileGap(page, 1, "before", "inline", null, "board-1-item-1");
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).uncheck();
  await page.mouse.move(10, 10);
  await expect(page.locator("[data-demo-drop-output]")).toHaveText("");
  await expect(page.locator(".rivto-block-drop-wrapper-boundary")).toHaveCount(0);
});

test("grid gutters resolve between actual tiles and rows, including RTL", async ({ page }) => {
  await page.goto("/?example=bento");
  const host = page.locator('[data-block-id="board-1"] > .rivto-block-children');
  await host.evaluate((element) => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "repeat(2, max-content)";
  });
  await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).check();
  const output = page.locator("[data-demo-drop-output]");
  const first = page.locator('[data-demo-tile="board-1-item-1"]');
  const third = page.locator('[data-demo-tile="board-1-item-3"]');
  await first.scrollIntoViewIfNeeded();
  const bounds = (await first.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width - 3, bounds.y + bounds.height / 2);
  await expect(output).toHaveText(
    JSON.stringify({
      kind: "between",
      parentId: "board-1",
      previousId: "board-1-item-1",
      nextId: "board-1-item-2",
    }),
  );
  await third.scrollIntoViewIfNeeded();
  const row = (await third.boundingBox())!;
  await page.mouse.move(row.x + row.width / 2, row.y + 3);
  await expect(output).toHaveText(
    JSON.stringify({
      kind: "between",
      parentId: "board-1",
      previousId: "board-1-item-2",
      nextId: "board-1-item-3",
    }),
  );
  await host.evaluate((element) => {
    element.setAttribute("dir", "rtl");
  });
  await expectTileGap(page, 1, "before", "inline", null, "board-1-item-1");
  const tile = (await first.boundingBox())!;
  const start = (await first
    .locator(':scope > [data-drop-placement="before"][data-drop-edge="inline"]')
    .boundingBox())!;
  expect(start.x + start.width).toBeCloseTo(tile.x + tile.width, 1);
  expect(start.x).toBeGreaterThan(tile.x);
});

/**
 * Checks a real pointer hit against a tile's explicit canonical edge destination.
 *
 * @param page - Demo page with the inspector enabled.
 * @param item - One-based tile index in the first board.
 * @param placement - Before or after the tile in the real child list.
 * @param edge - Block or inline edge region to hover away from its corners.
 * @param previousId - Expected canonical predecessor, or null at the start.
 * @param nextId - Expected canonical successor, or null at the end.
 * @returns Resolves after the inspector reports the exact between destination.
 */
async function expectTileGap(
  page: Page,
  item: number,
  placement: "before" | "after",
  edge: "block" | "inline",
  previousId: string | null,
  nextId: string | null,
): Promise<void> {
  await page
    .locator(
      `[data-demo-tile="board-1-item-${item}"] > [data-drop-placement="${placement}"][data-drop-edge="${edge}"]`,
    )
    .hover();
  await expect(page.locator("[data-demo-drop-output]")).toHaveText(
    JSON.stringify({ kind: "between", parentId: "board-1", previousId, nextId }),
  );
}

for (const example of ["kanban", "bento"]) {
  for (const repeat of [1, 200]) {
    test(`${example} bounds content and pointer resolution repeat=${repeat} @performance`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(60000);
      await page.goto(`/?example=${example}&repeat=${repeat}`);
      await expect(page.locator("[data-block-id]")).toHaveCount(
        repeat * (example === "kanban" ? 10 : 7),
      );
      const id = example === "kanban" ? "board-1-item-1-child-1" : "board-1-item-1";
      const text = page.getByRole("textbox", { name: `Text ${id}`, exact: true });
      await text.fill("Warm");
      await page.getByRole("button", { name: "Reset counters", exact: true }).click();
      await text.press("End");
      await text.press("x");
      await expect(text).toHaveText("Warmx");
      await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
      const changed: DemoMetrics = JSON.parse(
        (await page.locator("[data-demo-metrics]").textContent())!,
      );
      expect(changed.blockIdsReads).toBe(0);
      expect(changed.nodeReads).toBeLessThanOrEqual(40);
      expect(changed.notifications).toBeLessThanOrEqual(4);
      await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).check();
      const gap = page.locator('[data-drop-gap="board-1"]').first();
      await page.getByRole("button", { name: "Reset counters", exact: true }).click();
      // Toolbar clicks can scroll the target away; restore visibility after resetting counters.
      await gap.scrollIntoViewIfNeeded();
      const samples = await measureDropTargets(page, gap);
      await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
      const pointer: DemoMetrics = JSON.parse(
        (await page.locator("[data-demo-metrics]").textContent())!,
      );
      expect(pointer.blockIdsReads).toBe(0);
      expect(pointer.notifications).toBe(0);
      expect(pointer.nodeReads).toBeLessThanOrEqual(12);
      await expect(page.locator('[data-node-identity="changed"]')).toHaveCount(0);
      console.log(
        `${testInfo.project.name} ${example} repeat=${repeat}: ${JSON.stringify({ changed, pointer, samples })}`,
      );
    });
  }
}

/** Resolver duration and real pointer-event to two-frame rendering proxy, in milliseconds. */
interface DropTimingSample {
  readonly resolveMs: number;
  readonly domMs: number;
}

/**
 * Captures one real pointer event before the inspector's frame-throttled feedback.
 *
 * @param page - Production demo page with the inspector enabled.
 * @returns Resolves when the one-shot timing listener is installed.
 */
async function capturePointerTiming(page: Page): Promise<void> {
  await page.locator("[data-demo-drop-output]").evaluate((element) => {
    element.removeAttribute("data-pointer-ms");
    window.addEventListener(
      "pointermove",
      () => {
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            element.setAttribute("data-pointer-ms", String(performance.now() - start)),
          ),
        );
      },
      { once: true, capture: true },
    );
  });
}

/**
 * Measures five equivalent real pointer samples over one visible explicit gap.
 *
 * @param page - Warm production demo with the inspector enabled and counters reset.
 * @param gap - Registered region scrolled into view after toolbar actions; samples use its visible portion.
 * @returns Five synchronous resolver and pointer-to-two-frame durations in milliseconds.
 * @throws If the gap has no unobstructed visible sample point or does not resolve a destination.
 */
async function measureDropTargets(page: Page, gap: Locator): Promise<DropTimingSample[]> {
  const point = await gap.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    if (right <= left || bottom <= top || !hit || !element.contains(hit)) {
      throw new Error("Performance gap has no unobstructed visible sample point");
    }
    return { x, y, offset: Math.min(1, (right - left) / 4) };
  });
  const samples: DropTimingSample[] = [];
  for (let sample = 0; sample < 5; sample++) {
    await capturePointerTiming(page);
    await page.mouse.move(point.x + (sample % 2) * point.offset, point.y);
    const output = page.locator("[data-demo-drop-output]");
    await expect(output).toContainText('"kind":"between"');
    await expect(output).toHaveAttribute("data-pointer-ms", /\d/);
    samples.push({
      resolveMs: Number(await output.getAttribute("data-resolve-ms")),
      domMs: Number(await output.getAttribute("data-pointer-ms")),
    });
  }
  return samples;
}

test("wrapper boundaries remain hit-testable when inspection is inactive", async ({ page }) => {
  await page.goto("/?example=bento");
  const select = page.getByLabel("Tile width board-1-item-1", { exact: true });
  await select.scrollIntoViewIfNeeded();
  const hit = await select.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 3) === element;
  });
  expect(hit).toBe(true);
  const bounds = (await select.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height - 3);
  await expect(select).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).check();
  await expectTileGap(page, 1, "after", "block", "board-1-item-1", "board-1-item-2");
  await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).uncheck();
  const boundary = page.locator(
    '[data-demo-tile="board-1-item-1"] > [data-drop-placement="after"][data-drop-edge="block"]',
  );
  await boundary.scrollIntoViewIfNeeded();
  expect(
    await boundary.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) ===
        element
      );
    }),
  ).toBe(true);
  await select.scrollIntoViewIfNeeded();
  const restored = await select.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 3) === element;
  });
  expect(restored).toBe(true);
});

test("keeps tile controls clickable while drop inspection is enabled", async ({ page }) => {
  await page.goto("/?example=bento");
  await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).check();
  const select = page.getByLabel("Tile width board-1-item-1", { exact: true });
  await select.scrollIntoViewIfNeeded();
  const hit = await select.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 3) === element;
  });
  expect(hit).toBe(true);
  const bounds = (await select.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height - 3);
  await expect(select).toBeFocused();
  await page.keyboard.press("Escape");
});

test("wrapper boundaries reserve package-owned space outside tile content", async ({ page }) => {
  await page.goto("/?example=bento");
  await page.locator("style[data-demo-chrome]").evaluate((element) => element.remove());
  const wrapper = page.locator('[data-demo-tile="board-1-item-1"]');
  await wrapper.scrollIntoViewIfNeeded();
  const geometry = await wrapper.evaluate((element) => {
    const outer = element.getBoundingClientRect();
    const center = element
      .querySelector(".rivto-block-drop-wrapper-content")!
      .getBoundingClientRect();
    const boundaries = [...element.querySelectorAll(":scope > [data-drop-edge]")];
    return {
      width: outer.width,
      insets: [
        center.left - outer.left,
        outer.right - center.right,
        center.top - outer.top,
        outer.bottom - center.bottom,
      ],
      overlap: boundaries.some((boundary) => {
        const rect = boundary.getBoundingClientRect();
        return (
          rect.left < center.right &&
          rect.right > center.left &&
          rect.top < center.bottom &&
          rect.bottom > center.top
        );
      }),
      position: boundaries.map((boundary) => getComputedStyle(boundary).position),
    };
  });
  expect(geometry.width).toBe(280);
  expect(geometry.insets).toEqual([8, 8, 8, 8]);
  expect(geometry.overlap).toBe(false);
  expect(geometry.position).toEqual(["static", "static", "static", "static"]);
  const host = page.locator('[data-block-id="board-1"] > .rivto-block-children');
  await expect(host).toHaveCSS("gap", "0px");
  await host.evaluate((element) => element.style.setProperty("--rivto-drop-gap-size", "18px"));
  const strip = wrapper.locator(':scope > [data-drop-placement="before"][data-drop-edge="inline"]');
  await expect(strip).toHaveCSS("width", "18px");
  const content = wrapper.locator(":scope > .rivto-block-drop-wrapper-content");
  await expect(content).toHaveCSS("width", "244px");
});
