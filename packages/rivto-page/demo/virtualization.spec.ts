import { expect, test, type Page } from "@playwright/test";
import type { BlockSelectionSnapshot } from "../src";

/**
 * Reads model selection from optional host diagnostics, independently of mounted blocks.
 *
 * @param page - Demo with selection inspection enabled.
 * @returns Current host snapshot, or null when selection is empty.
 */
async function readSelection(page: Page): Promise<BlockSelectionSnapshot | null> {
  return JSON.parse((await page.locator("[data-demo-selection]").textContent())!);
}

/**
 * Opens a large windowed outline and its model-selection inspector.
 *
 * @param page - Browser page to navigate.
 * @returns The editor and selection diagnostics are mounted.
 */
async function openVirtual(page: Page): Promise<void> {
  await page.goto("/?repeat=200&virtual");
  await page.getByText("Selection settings", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Inspect selection", exact: true }).check();
}

test("keeps offscreen selection and indents/outdents every selected ID", async ({ page }) => {
  await openVirtual(page);
  await page.locator('[data-block-id="block-2"] strong').first().click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('[data-block-id="block-998"]')).toBeVisible();
  await expect(page.locator('[data-block-id="block-2"]')).toHaveCount(0);
  await page.keyboard.down("Shift");
  await page.locator('[data-block-id="block-998"] strong').first().click();
  await page.keyboard.up("Shift");
  const selected = (await readSelection(page))!;
  expect(selected.blocks.some((range) => range.id === "block-500")).toBe(true);
  expect(selected.blocks.length).toBeGreaterThan(990);
  await page.locator("[data-rivto-block-editor]").focus();
  await page.keyboard.press("Tab");
  expect((await readSelection(page))?.blocks).toEqual(selected.blocks);
  await page.keyboard.press("Shift+Tab");
  expect((await readSelection(page))?.blocks).toEqual(selected.blocks);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('[data-block-id="block-2"]')).toHaveAttribute(
    "data-block-selected",
    "true",
  );
  expect(await page.locator("[data-block-id]").count()).toBeLessThan(35);
});

test("retains a native caret while scrolling and releases old focus pins", async ({ page }) => {
  await openVirtual(page);
  const first = page.getByRole("textbox", { name: "Text block-1", exact: true });
  await first.click();
  await first.press("End");
  await expect.poll(async () => (await readSelection(page))?.blocks[0]?.start).toBe(12);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('[data-block-id="block-998"]')).toBeVisible();
  await expect(first).toBeAttached();
  expect((await readSelection(page))?.blocks[0]?.id).toBe("block-1");
  const last = page.getByRole("textbox", { name: "Text block-998", exact: true });
  await last.click();
  await expect.poll(async () => (await readSelection(page))?.blocks[0]?.id).toBe("block-998");
  await expect(first).toHaveCount(0);
  expect(await page.locator("[data-block-id]").count()).toBeLessThan(35);
});

for (const example of ["kanban", "bento"]) {
  test(`preserves ${example} child layout and drops unmounted targets`, async ({ page }) => {
    await page.goto(`/?example=${example}&repeat=200&virtual`);
    await expect(page.locator('[data-block-id="board-1"]')).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('[data-block-id="board-200"]')).toBeVisible();
    await expect(page.locator('[data-block-id="board-1"]')).toHaveCount(0);
    await expect(page.locator('[data-block-id="board-200-item-1"]')).toBeAttached();
    expect(await page.locator("[data-block-id]").count()).toBeLessThan(100);
  });
}

for (const repeat of [1, 200]) {
  test(`windowed selection repeat=${repeat} @performance`, async ({ page }, testInfo) => {
    await page.goto(`/?repeat=${repeat}&virtual`);
    const anchor = page.locator('[data-block-id="block-1"] strong').first();
    const samples = [];
    for (let index = 0; index < 6; index++) {
      await page.getByRole("button", { name: "Reset counters", exact: true }).click();
      await anchor.scrollIntoViewIfNeeded();
      await anchor.evaluate((element) =>
        element.addEventListener(
          "pointerdown",
          () => {
            const start = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                element.setAttribute("data-selection-ms", String(performance.now() - start));
              }),
            );
          },
          { once: true, capture: true },
        ),
      );
      await page.keyboard.down("Control");
      await anchor.click();
      await page.keyboard.up("Control");
      await expect(anchor).toHaveAttribute("data-selection-ms", /\d/);
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
      await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
      const metrics = JSON.parse((await page.locator("[data-demo-metrics]").textContent())!);
      expect(metrics.nodeReads).toBeLessThanOrEqual(24);
      expect(await page.locator("[data-block-id]").count()).toBeLessThan(35);
      if (index) {
        samples.push({
          commandMs: metrics.selectionCommandMs,
          domMs: Number(await anchor.getAttribute("data-selection-ms")),
          nodeReads: metrics.nodeReads,
        });
      }
    }
    console.log(`${testInfo.project.name} virtual repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}

test("keeps directed text endpoints and model coverage across virtual gaps", async ({ page }) => {
  await openVirtual(page);
  await page.getByRole("textbox", { name: "Text block-1", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('[data-block-id="block-998"]')).toBeVisible();
  await page.evaluate(() => {
    const first = document.querySelector('[data-block-id="block-1"] [data-block-content]')!;
    const last = document.querySelector('[data-block-id="block-998"] [data-block-content]')!;
    window.getSelection()!.setBaseAndExtent(last.firstChild!, 5, first.firstChild!, 2);
  });
  await expect.poll(async () => (await readSelection(page))?.anchorBlockId).toBe("block-998");
  const coverage = (await readSelection(page))!;
  expect(coverage.blocks.some((block) => block.id === "block-500")).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await expect(page.locator('[data-block-id="block-998"]')).toBeAttached();
  await expect(page.locator('[data-block-id="block-1"]')).toBeAttached();
  expect((await readSelection(page))?.blocks.map((block) => block.id)).toEqual(
    coverage.blocks.map((block) => block.id),
  );
  expect(await page.locator("[data-block-id]").count()).toBeLessThan(40);
});

test("keeps root counters independent of mounting and nested counters", async ({ page }) => {
  await page.goto("/?virtual");
  const fourth = page.locator('[data-virtual-block-id="block-4"]');
  const fifth = page.locator('[data-virtual-block-id="block-5"]');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(fourth).toHaveCSS("counter-reset", "rivto-list-number 1");
  await expect(fifth).toHaveCSS("counter-reset", "rivto-list-number 2");
  await page.getByLabel("List type block-4", { exact: true }).selectOption("");
  await expect(fifth).toHaveCSS("counter-reset", "rivto-list-number 2");
  await page.getByRole("checkbox", { name: "Custom renderer", exact: true }).check();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByLabel("List type block-5", { exact: true }).selectOption("numbered_list");
  await expect(fifth).toHaveCSS("counter-reset", "rivto-list-number 1");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByLabel("List type child-0", { exact: true }).selectOption("numbered_list");
  await expect(page.locator('[data-block-id="child-0"]')).toHaveCSS(
    "counter-set",
    "rivto-list-number 1",
  );
  await page.getByRole("button", { name: "Reverse block order", exact: true }).click();
  await expect(fifth).toHaveCSS("counter-reset", "rivto-list-number 1");
  await page.locator("style[data-demo-chrome]").evaluate((element) => {
    (element as HTMLStyleElement).sheet!.disabled = true;
  });
  await page.locator("[data-rivto-block-editor]").evaluate((element) => {
    (element as HTMLElement).style.setProperty("--rivto-drop-target-size", "28px");
  });
  await expect(fifth).toHaveCSS("padding-bottom", "4px");
  await expect(fifth.locator(":scope > .rivto-block-drop-gap")).toHaveCount(0);
  await expect(fifth.locator(":scope > .rivto-block-outline-drop-gap")).toHaveCount(0);
});

test("preserves selection across virtual view detach and remount", async ({ page }) => {
  await openVirtual(page);
  await page.locator('[data-block-id="block-2"] strong').first().click();
  const before = await readSelection(page);
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).uncheck();
  expect(await readSelection(page)).toEqual(before);
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).check();
  await expect(page.locator('[data-block-id="block-2"]')).toHaveAttribute(
    "data-block-selected",
    "true",
  );
});

for (const repeat of [1, 200]) {
  test(`virtual indent and outdent repeat=${repeat} @performance`, async ({ page }, testInfo) => {
    await page.goto(`/?repeat=${repeat}&virtual`);
    await page.locator('[data-block-id="block-2"] strong').first().click();
    await page
      .locator('[data-block-id="block-3"] strong')
      .first()
      .click({ modifiers: ["Shift"] });
    const editor = page.locator("[data-rivto-block-editor]");
    const samples = [];
    for (let index = 0; index < 6; index++) {
      await editor.focus();
      await editor.evaluate((element) => {
        element.removeAttribute("data-command-ms");
        element.addEventListener(
          "keydown",
          () => {
            const start = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                element.setAttribute("data-command-ms", String(performance.now() - start));
              }),
            );
          },
          { once: true },
        );
      });
      await page.keyboard.press("Tab");
      await expect(
        page.locator('[data-block-id="block-1"] [data-block-id="block-2"]'),
      ).toBeAttached();
      await expect(editor).toHaveAttribute("data-command-ms", /\d/);
      await page.getByRole("button", { name: "Refresh statistics", exact: true }).click();
      const metrics = JSON.parse((await page.locator("[data-demo-metrics]").textContent())!);
      if (index) {
        samples.push({
          commandMs: metrics.commandMs,
          domMs: Number(await editor.getAttribute("data-command-ms")),
        });
      }
      await editor.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator('[data-virtual-block-id="block-2"]')).toBeAttached();
      await expect(page.locator('[data-block-id="block-2"]')).toHaveAttribute(
        "data-block-selected",
        "true",
      );
      expect(await page.locator("[data-block-id]").count()).toBeLessThan(35);
    }
    console.log(
      `${testInfo.project.name} virtual indent repeat=${repeat}: ${JSON.stringify(samples)}`,
    );
  });
}

test("mounts an offscreen anchor before extending an exact text range", async ({ page }) => {
  await openVirtual(page);
  await page.getByRole("textbox", { name: "range binding", exact: true }).fill("Shift, Shift+Alt");
  await page.locator('[data-block-id="block-2"] strong').first().click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('[data-block-id="block-2"]')).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Text block-998", exact: true })
    .click({ modifiers: ["Shift", "Alt"] });
  await expect.poll(async () => (await readSelection(page))?.focusBlockId).toBe("block-998");
  expect((await readSelection(page))?.anchorBlockId).toBe("block-2");
  await expect(page.locator('[data-block-id="block-2"]')).toBeAttached();
  expect((await readSelection(page))?.blocks.some((block) => block.id === "block-500")).toBe(true);
  expect(await page.locator("[data-block-id]").count()).toBeLessThan(40);
});

test("changes block-tree windowing settings without replacing retained roots", async ({ page }) => {
  await page.goto("/?repeat=200");
  const first = page.locator('[data-block-id="block-1"]');
  await expect(first).toBeAttached();
  const original = await first.elementHandle();
  const tree = page.locator(".rivto-virtual-tree");
  await expect(tree).toHaveAttribute("data-virtualized", "false");
  await expect(page.locator("[data-virtual-block-id]")).toHaveCount(1000);
  await page.getByRole("checkbox", { name: "Virtualize blocks", exact: true }).check();
  await expect(tree).toHaveAttribute("data-virtualized", "true");
  await expect.poll(() => page.locator("[data-virtual-block-id]").count()).toBeLessThan(30);
  const mounted = await page.locator("[data-virtual-block-id]").count();
  await page.getByRole("spinbutton", { name: "Overscan roots", exact: true }).fill("12");
  await expect.poll(() => page.locator("[data-virtual-block-id]").count()).toBeGreaterThan(mounted);
  await page
    .getByRole("spinbutton", { name: "Estimated root height (px)", exact: true })
    .fill("120");
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole("checkbox", { name: "Virtualize blocks", exact: true }).uncheck();
  await expect(page.locator("[data-virtual-block-id]")).toHaveCount(1000);
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
});

test("keeps a themed ending area after the virtual forest", async ({ page }) => {
  await page.goto("/?repeat=200&virtual");
  await expect(page.locator("[data-rivto-block-editor]")).toBeVisible();
  await expect(page.locator('[data-block-id="block-1000"]')).toHaveCount(0);
  const end = page.locator(".rivto-block-editor-end");
  await expect(end).toHaveCSS("min-height", "48px");
  await page.getByRole("checkbox", { name: "Inspect drop zones", exact: true }).check();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('[data-block-id="block-1000"]')).toBeVisible();
  await end.scrollIntoViewIfNeeded();
  const rect = (await end.boundingBox())!;
  await page.mouse.move(rect.x + 12, rect.y + rect.height - 2);
  await expect(page.locator("[data-demo-drop-output]")).toHaveText(
    JSON.stringify({ kind: "between", parentId: null, previousId: "block-1000", nextId: null }),
  );
  const line = (await page.locator("[data-demo-drop-overlay]").boundingBox())!;
  expect(line.y + line.height / 2).toBeCloseTo(rect.y, 1);
});
