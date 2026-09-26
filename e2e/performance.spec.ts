/**
 * Browser regression coverage for editor interaction on large documents.
 *
 * The fixtures mount 500 decorated Markdown blocks and 2,000 writing blocks
 * across flat and nested outlines so timing includes real DOM rendering.
 *
 * @module
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const PAGE_SURFACE_CLASS = "page-surface";
const PAGE_BLOCK_ROW_CLASS = "page-block-row";
const PAGE_DRAG_OVERLAY_CLASS = "page-drag-overlay";

/**
 * Mounts the large checkbox-decorated Markdown fixture in one undo item.
 *
 * @param page - Demo page receiving the fixture.
 * @returns Completion after the last block is visible.
 */
async function seedLargeDocument(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    const runtime = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    runtime.history.batchUpdates(() => {
      let afterId = runtime.blocks.getRootIds().at(-1);
      for (let index = 0; index < 500; index += 1) {
        afterId = runtime.blocks.insertBlock({
          type: "paragraph",
          content: `Performance block **${index}**`,
          listProps: { type: "checkbox" },
        }, afterId).id;
      }
    });
  });
  await expect(page.getByText("Performance block 499", { exact: true })).toBeVisible();
}

/**
 * Mounts 2,000 writing blocks as roots or evenly distributed branch children.
 *
 * @param page - Demo page receiving the fixture.
 * @param branches - Number of parent blocks, or zero for flat roots.
 * @returns IDs of six adjacent children or roots for drag and edit samples.
 */
async function seedOutlineDocument(page: Page, branches: number): Promise<string[]> {
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Virtualize page" }).check();
  await page.getByRole("spinbutton", { name: "Virtualize after roots count" }).fill("1000");
  const siblings = await page.evaluate((count) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    const childrenPerBranch = count ? Math.floor((2_000 - count) / count) : 0;
    editor.history.batchUpdates(() => {
      let afterId = editor.blocks.getRootIds().at(-1);
      if (count) {
        for (let branch = 0; branch < count; branch += 1) {
          const children = Array.from({ length: childrenPerBranch + (branch < (2_000 - count) % count ? 1 : 0) }, (_, index) => ({
            id: `perf-b${branch}-c${index}`,
            type: "paragraph",
            content: `Child ${branch}-${index}`,
          }));
          afterId = editor.blocks.insertBlock({ id: `perf-b${branch}`, type: "paragraph", content: `Branch ${branch}`, children }, afterId).id;
        }
      } else {
        for (let index = 0; index < 2_000; index += 1) {
          afterId = editor.blocks.insertBlock({ id: `perf-root-${index}`, type: "paragraph", content: `Root ${index}` }, afterId).id;
        }
      }
    });
    return Array.from({ length: 6 }, (_, index) => count ? `perf-b0-c${index}` : `perf-root-${index}`);
  }, branches);
  if (!branches) {
    await page.evaluate(async () => {
      window.scrollTo(0, 0);
      for (let attempt = 0; attempt < 20 && !document.querySelector('[data-block-id="perf-root-0"]'); attempt += 1) {
        window.scrollBy(0, 200);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
    });
  }
  await expect(page.locator(`[data-block-id="${siblings[0]}"]`)).toHaveCount(1);
  return siblings;
}

test("windows 2,000 flat page roots and can disable windowing", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  const roots = page.locator(`.${PAGE_SURFACE_CLASS} [data-block-id^="perf-root-"]`);
  await expect(page.locator('[data-block-id="perf-root-0"]')).toHaveCount(1);
  await expect.poll(() => roots.count()).toBeLessThan(500);
  await page.getByRole("checkbox", { name: "Virtualize page" }).uncheck();
  await expect(roots).toHaveCount(2_000);
  await page.getByRole("checkbox", { name: "Virtualize page" }).check();
  await expect.poll(() => roots.count()).toBeLessThan(500);
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor;
    editor.blocks.updateBlock("perf-root-1999", { content: "Updated offscreen root" });
  });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('[data-block-id="perf-root-1999"]')).toHaveCount(1);
  await expect(page.locator('[data-block-id="perf-root-1999"] [data-block-content]')).toHaveText("Updated offscreen root");
  await expect.poll(() => roots.count()).toBeLessThan(500);
});

test("configures the page threshold and symmetric root buffer", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  const roots = page.locator(`.${PAGE_SURFACE_CLASS} [data-block-id^="perf-root-"]`);
  await expect(page.locator('[data-block-id="perf-root-150"]')).toHaveCount(0);
  await expect(page.locator('[data-block-id="perf-root-500"]')).toHaveCount(0);

  await page.getByRole("spinbutton", { name: "Extra roots per side" }).fill("200");
  await expect(page.locator('[data-block-id="perf-root-150"]')).toHaveCount(1);
  await page.getByRole("spinbutton", { name: "Extra roots per side" }).fill("8");
  await expect(page.locator('[data-block-id="perf-root-150"]')).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Virtualize after roots count" }).fill("3000");
  await expect(roots).toHaveCount(2_000);
  await page.getByRole("spinbutton", { name: "Virtualize after roots count" }).fill("1000");
  await expect.poll(() => roots.count()).toBeLessThan(150);
});

test("keeps virtualization off by default and treats true as always on", async ({ page }) => {
  await seedLargeDocument(page);
  const roots = page.locator(`.${PAGE_SURFACE_CLASS} > [data-block-id]`);
  await expect(page.getByRole("checkbox", { name: "Virtualize page" })).not.toBeChecked();
  await expect.poll(() => roots.count()).toBeGreaterThan(500);
  await page.getByRole("checkbox", { name: "Virtualize page" }).check();
  await expect.poll(() => roots.count()).toBeLessThan(350);
  await page.getByRole("checkbox", { name: "Virtualize page" }).uncheck();
  await expect.poll(() => roots.count()).toBeGreaterThan(500);
});

test("skips offscreen content paint while keeping block shells and TODO fields mounted", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  await page.getByRole("checkbox", { name: "Virtualize page" }).uncheck();
  // Suppress Chromium's native drag scrolling so this verifies the editor's
  // pointer loop, which also covers structural and cross-block selections.
  await page.evaluate(() => {
    document.addEventListener("selectstart", (event) => event.preventDefault(), { capture: true });
    window.addEventListener("pointermove", (event) => event.preventDefault(), { capture: true });
  });
  await expect(page.locator(`.${PAGE_SURFACE_CLASS} [data-block-id^="perf-root-"]`)).toHaveCount(2_000);
  const styles = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('[data-block-id="perf-root-1999"] .markdown-content');
    const row = document.querySelector<HTMLElement>('[data-block-id="perf-root-1999"] > .page-block-row');
    const description = document.querySelector<HTMLElement>('[data-journal-document="today"] .rivto-todo-description');
    if (!content || !row || !description) throw new Error("Expected mounted content, row, and TODO description");
    const previewText = content.querySelector(".markdown-preview p");
    return {
      content: getComputedStyle(content).contentVisibility,
      row: getComputedStyle(row).contentVisibility,
      description: getComputedStyle(description).contentVisibility,
      offscreenContentSkipped: previewText ? !previewText.checkVisibility({ contentVisibilityAuto: true }) : null,
    };
  });
  expect(styles).toEqual({ content: "auto", row: "visible", description: "auto", offscreenContentSkipped: true });
  const handle = page.locator('[data-block-id="perf-root-0"]').getByRole("button", { name: /^Move block:/ });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error("Expected drag handle outside the skipped content");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2);
  await expect(page.locator(`.${PAGE_DRAG_OVERLAY_CLASS}`)).toBeVisible();
  await page.mouse.up();
});

test("moves the caret through a page window boundary", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  await page.locator('[data-block-id="perf-root-0"] [data-block-content]').click();
  for (let index = 0; index < 35; index += 1) await page.keyboard.press("ArrowDown");
  const focused = await page.evaluate(() => (window as unknown as {
    __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
  }).__rivtoDemo.editor.selection.get()?.focusBlockId);
  expect(Number(focused?.replace("perf-root-", ""))).toBeGreaterThan(20);
  await expect(page.locator(`[data-block-id="${focused}"]`)).toHaveCount(1);
});

test("extends a text selection through a page window boundary", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  await page.locator('[data-block-id="perf-root-0"] [data-block-content]').click();
  for (let index = 0; index < 35; index += 1) await page.keyboard.press("Shift+ArrowDown");
  const selection = await page.evaluate(() => {
    const current = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor.selection.get();
    return { anchor: current?.anchorBlockId, focus: current?.focusBlockId, native: Boolean(window.getSelection()?.rangeCount) };
  });
  expect(selection.anchor).toBe("perf-root-0");
  expect(Number(selection.focus?.replace("perf-root-", ""))).toBeGreaterThan(20);
  expect(selection.native).toBe(true);
  await expect(page.locator('[data-block-id="perf-root-0"]')).toHaveCount(1);
});

test("keeps a structural selection complete across virtual gaps for keyboard commands", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  const first = page.locator('[data-block-id="perf-root-1"] [data-block-content]');
  const last = page.locator('[data-block-id="perf-root-100"] [data-block-content]');
  await first.click();
  await page.evaluate(() => window.scrollTo(0, 6_500));
  await expect(last).toHaveCount(1);
  await last.scrollIntoViewIfNeeded();
  await last.click({ modifiers: ["Shift"] });

  const selectedIds = await page.evaluate(() => (
    (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.selection.get()?.blocks.map((block) => block.id)
  ));
  expect(selectedIds).toEqual(Array.from({ length: 100 }, (_, index) => `perf-root-${index + 1}`));

  const beforeIndent = await last.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
  }));
  await page.keyboard.press("Tab");
  await page.mouse.wheel(0, 12);
  await page.waitForTimeout(250);
  const afterIndent = await last.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
  }));
  expect(afterIndent.top).toBeCloseTo(beforeIndent.top - 12, 0);
  const indentedParents = await page.evaluate(() => {
    const blocks = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.blocks;
    return Array.from({ length: 100 }, (_, index) => blocks.getParentId(`perf-root-${index + 1}`));
  });
  expect(indentedParents).toEqual(Array.from({ length: 100 }, () => "perf-root-0"));

  await page.keyboard.press("Shift+Tab");
  const outdentedParents = await page.evaluate(() => {
    const blocks = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.blocks;
    return Array.from({ length: 100 }, (_, index) => blocks.getParentId(`perf-root-${index + 1}`));
  });
  expect(outdentedParents).toEqual(Array.from({ length: 100 }, () => null));

  await page.keyboard.press("Delete");
  const remaining = await page.evaluate(() => (
    (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.blocks.getRootIds()
  ));
  for (let index = 1; index <= 100; index += 1) {
    expect(remaining).not.toContain(`perf-root-${index}`);
  }
});

test("keeps scroll position when an offscreen virtualized root is indented and outdented", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  await page.evaluate(() => window.scrollTo(0, 6_500));
  const parent = page.locator('[data-block-id="perf-root-100"]');
  const child = page.locator('[data-block-id="perf-root-101"]');
  const childContent = page.locator('[data-block-id="perf-root-101"] [data-block-content]');
  await expect(parent).toHaveCount(1);
  await childContent.click();
  await child.evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, 60));

  const beforeIndent = await child.evaluate((element) => element.getBoundingClientRect().top);
  await page.keyboard.press("Tab");
  await page.mouse.wheel(0, 12);
  await page.waitForTimeout(250);
  expect(await child.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(beforeIndent - 12, 0);

  const beforeOutdent = await child.evaluate((element) => element.getBoundingClientRect().top);
  await page.keyboard.press("Shift+Tab");
  await page.mouse.wheel(0, 12);
  await page.waitForTimeout(250);
  expect(await child.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(beforeOutdent - 12, 0);
});

test("keeps the visible middle of a large selection fixed during repeated indent and outdent", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  const first = page.locator('[data-block-id="perf-root-1"] [data-block-content]');
  const last = page.locator('[data-block-id="perf-root-200"] [data-block-content]');
  await first.click();
  await page.evaluate(() => window.scrollTo(0, 11_000));
  await page.mouse.wheel(0, 1);
  await expect(last).toHaveCount(1);
  await last.click({ modifiers: ["Shift"] });

  const visible = page.locator('[data-block-id="perf-root-50"]');
  for (let scrollTop = 2_000; scrollTop <= 5_000 && await visible.count() === 0; scrollTop += 100) {
    await page.evaluate((top) => window.scrollTo(0, top), scrollTop);
    await page.mouse.wheel(0, 1);
  }
  await expect(visible).toHaveCount(1);
  await visible.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await page.keyboard.press("Tab");
  await page.waitForTimeout(400);
  const before = await visible.evaluate((element) => ({
    scrollY: window.scrollY,
    top: element.getBoundingClientRect().top,
  }));

  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
  }
  await page.waitForTimeout(400);

  const after = await visible.evaluate((element) => ({
    scrollY: window.scrollY,
    top: element.getBoundingClientRect().top,
  }));
  expect(await page.evaluate(() => (
    window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }
  ).__rivtoDemo.editor.blocks.getParentId("perf-root-50"))).toBe("perf-root-0");
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(8);
});

test("auto-scrolls a virtualized page while extending a pointer selection", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  const first = page.locator('[data-block-id="perf-root-0"] [data-block-content]');
  await first.scrollIntoViewIfNeeded();
  await first.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const point = await first.evaluate((element) => {
    const node = element.firstChild;
    if (!node) throw new Error("Expected first virtualized block text");
    const range = document.createRange();
    range.setStart(node, 1);
    range.setEnd(node, 2);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + rect.height / 2 };
  });
  const initialHead = await page.locator('[data-block-id="perf-root-1"] [data-block-content]').evaluate((element) => {
    const node = element.firstChild;
    if (!node) throw new Error("Expected initial selection head text");
    const range = document.createRange();
    range.setStart(node, 1);
    range.setEnd(node, 2);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + rect.height / 2 };
  });
  const startScroll = await page.evaluate(() => window.scrollY);

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(initialHead.x, initialHead.y, { steps: 5 });
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.selection.get()?.blocks.length ?? 0
  ))).toBeGreaterThan(1);
  await page.mouse.move(point.x, page.viewportSize()!.height - 2, { steps: 5 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(startScroll + 100);
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.selection.get()?.blocks.length ?? 0
  ))).toBeGreaterThan(5);
  await page.mouse.up();

  const selected = await page.evaluate(() => {
    const selection = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.selection.get();
    return {
      count: selection?.blocks.length ?? 0,
      focus: selection?.focusBlockId,
    };
  });
  expect(selected.count).toBeGreaterThan(5);
  expect(Number(selected.focus?.replace("perf-root-", ""))).toBeGreaterThan(5);
});

test("auto-scrolls a non-virtualized page while extending a pointer selection", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  await page.getByRole("checkbox", { name: "Virtualize page" }).uncheck();
  const first = page.locator('[data-block-id="perf-root-0"] [data-block-content]');
  await first.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const point = await first.evaluate((element) => {
    const node = element.firstChild;
    if (!node) throw new Error("Expected first non-virtualized block text");
    const range = document.createRange();
    range.setStart(node, 1);
    range.setEnd(node, 2);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + rect.height / 2 };
  });
  const initialHead = await page.locator('[data-block-id="perf-root-1"] [data-block-content]').evaluate((element) => {
    const node = element.firstChild;
    if (!node) throw new Error("Expected neighboring non-virtualized block text");
    const range = document.createRange();
    range.setStart(node, 1);
    range.setEnd(node, 2);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + rect.height / 2 };
  });
  const startScroll = await page.evaluate(() => window.scrollY);

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(initialHead.x, initialHead.y, { steps: 5 });
  await page.mouse.move(point.x, page.viewportSize()!.height - 2, { steps: 5 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(startScroll + 100);
  await expect.poll(() => page.evaluate(() => (
    (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.selection.get()?.blocks.length ?? 0
  ))).toBeGreaterThan(5);
  await page.mouse.up();
});

test("keeps numbered-list values after earlier roots unmount", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor;
    editor.history.batchUpdates(() => {
      for (let index = 0; index < 120; index += 1) {
        editor.blocks.updateBlock(`perf-root-${index}`, { listProps: { type: "numbered_list" } });
      }
    });
    window.scrollTo(0, editor.blocks.getRootIds().indexOf("perf-root-95") * 52);
  });
  const marker = page.locator('[data-block-id="perf-root-95"] .page-list-marker');
  await expect(marker).toHaveCount(1);
  const firstVisible = page.locator('.page-surface [data-index]').first();
  const counter = await firstVisible.evaluate((element) => ({
    id: element.getAttribute("data-block-id"),
    set: (element as HTMLElement).style.counterSet,
  }));
  expect(counter.set).toBe(`rivto-list-number ${Number(counter.id?.replace("perf-root-", ""))}`);
});

test("drops on a root first mounted after scrolling during drag", async ({ page }) => {
  await seedOutlineDocument(page, 0);
  const handle = page.locator('[data-block-id="perf-root-0"]').getByRole("button", { name: /^Move block:/ });
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  if (!source) throw new Error("Expected source handle");
  await expect(page.locator('[data-block-id="perf-root-100"]')).toHaveCount(0);
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 8, source.y + source.height / 2);
  await expect(page.locator(`.${PAGE_DRAG_OVERLAY_CLASS}`)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 6_500));
  await page.waitForTimeout(200);
  const target = page.locator('[data-block-id="perf-root-100"] > .page-block-row');
  await expect(target).toHaveCount(1);
  await target.scrollIntoViewIfNeeded();
  await expect(page.locator('[data-block-id="perf-root-0"]')).toHaveCount(1);
  const box = await target.boundingBox();
  if (!box) throw new Error("Expected newly mounted target row");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.up();
  const placement = await page.evaluate(() => {
    const blocks = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.blocks;
    return { parent: blocks.getParentId("perf-root-0"), order: blocks.getRootIds() };
  });
  expect(placement.parent === "perf-root-100" || Math.abs(
    placement.order.indexOf("perf-root-0") - placement.order.indexOf("perf-root-100"),
  ) <= 1).toBe(true);
});

test("toggles a checkbox responsively with 500 additional Markdown blocks", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "The timing budget is calibrated for Chromium; behavior is covered cross-browser by lists.spec.ts");
  await seedLargeDocument(page);

  const checkbox = page.getByRole("checkbox", { name: /Mark block as .*Try the interactive checkbox/ });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.locator('[data-editor-action="undo"]').click();
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();

  const samples: number[] = [];
  for (let index = 0; index < 7; index += 1) {
    samples.push(await checkbox.evaluate(async (element) => {
      const start = performance.now();
      (element as HTMLInputElement).click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return performance.now() - start;
    }));
  }
  samples.sort((left, right) => left - right);
  expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(100);
});

for (const mode of ["block", "edgeless"] as const) {
  const surface = mode === "block" ? "page" : "edgeless";
  test(`keeps ${surface} block drag feedback responsive with 500 mounted blocks`, async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== "chromium", "The timing budget is calibrated for Chromium");
    await seedLargeDocument(page);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();

    const source = page.getByRole("button", { name: "Move block: Performance block **0**" });
    const blockSelector = mode === "block"
      ? `.${PAGE_SURFACE_CLASS} > [data-block-id]`
      : "[data-edgeless-root] [data-block-id]";
    const targets = page.locator(blockSelector).filter({
      has: page.getByText(/^Performance block [1-7]$/),
    });
    await source.scrollIntoViewIfNeeded();
    let sourceBox = await source.boundingBox();
    if (!sourceBox) throw new Error("Expected drag source geometry");
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    // Browser scroll anchoring may shift a long page when an offscreen content
    // wrapper becomes relevant under the pointer; use the handle's live rect.
    sourceBox = await source.boundingBox();
    if (!sourceBox) throw new Error("Expected drag source geometry after hover");
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.evaluate(() => {
      (window as unknown as { __activationDuration: number }).__activationDuration = 0;
      window.addEventListener("pointermove", (event) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          (window as unknown as { __activationDuration: number }).__activationDuration = performance.now() - event.timeStamp;
        }));
      }, { capture: true });
    });
    await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 8, sourceBox.y + sourceBox.height / 2);
    await expect(page.locator(`.${PAGE_DRAG_OVERLAY_CLASS}`)).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { __activationDuration: number }).__activationDuration > 0);
    const activationTime = await page.evaluate(() => (window as unknown as { __activationDuration: number }).__activationDuration);
    expect(activationTime).toBeLessThan(150);

    const samples: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      const targetBox = await targets.nth(index).locator(`:scope > .${PAGE_BLOCK_ROW_CLASS}`).boundingBox();
      if (!targetBox) throw new Error("Expected drag target geometry");
      const start = await page.evaluate(() => performance.now());
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      samples.push(await page.evaluate(async (started) => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - started;
      }, start));
    }
    await page.evaluate(() => {
      (window as unknown as { __commitDuration: number }).__commitDuration = 0;
      window.addEventListener("pointerup", (event) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          (window as unknown as { __commitDuration: number }).__commitDuration = performance.now() - event.timeStamp;
        }));
      }, { capture: true, once: true });
    });
    await page.mouse.up();
    await page.waitForFunction(() => (window as unknown as { __commitDuration: number }).__commitDuration > 0);
    const commitTime = await page.evaluate(() => (window as unknown as { __commitDuration: number }).__commitDuration);

    samples.sort((left, right) => left - right);
    expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(100);
    expect(commitTime).toBeLessThan(150);
  });
}

for (const mode of ["block", "edgeless"] as const) {
  test(`moves, indents, and outdents 100 selected siblings promptly on ${mode}`, async ({ browserName, page }) => {
    test.skip(browserName !== "chromium", "The timing sample is calibrated for Chromium");
    test.setTimeout(180_000);
    await seedOutlineDocument(page, 1);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
    const times = await page.evaluate(async () => {
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo.editor;
      const ids = Array.from({ length: 100 }, (_, index) => `perf-b0-c${index + 100}`);
      /**
       * Measures a structural command and the next two browser frames.
       * @param action - Synchronous editor command to measure.
       * @returns Command duration and elapsed rendering time in milliseconds.
       */
      const measure = async (action: () => void): Promise<{ sync: number; rendered: number }> => {
        const start = performance.now();
        action();
        const sync = performance.now() - start;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { sync, rendered: performance.now() - start };
      };
      const move = await measure(() => editor.blocks.moveBlocks(ids, "perf-b0-c500", "after"));
      const afterMove = editor.blocks.getBlockNode("perf-b0")?.childIds.slice(400, 501);
      const indent = await measure(() => editor.blocks.indentBlocks(ids));
      const afterIndent = editor.blocks.getBlockNode("perf-b0-c500")?.childIds;
      const outdent = await measure(() => editor.blocks.outdentBlocks(ids));
      const afterOutdent = editor.blocks.getBlockNode("perf-b0")?.childIds.slice(400, 501);
      const tailOutdent = await measure(() => editor.blocks.outdentBlocks(ids));
      return { move, indent, outdent, tailOutdent, afterMove, afterIndent, afterOutdent,
        parent: editor.blocks.getParentId(ids[0]!), tailParent: editor.blocks.getParentId("perf-b0-c501") };
    });
    expect(times.parent).toBeNull();
    expect(times.tailParent).toBe("perf-b0-c199");
    const movedIds = Array.from({ length: 100 }, (_, index) => `perf-b0-c${index + 100}`);
    expect(times.afterMove).toEqual(["perf-b0-c500", ...movedIds]);
    expect(times.afterIndent).toEqual(movedIds);
    expect(times.afterOutdent).toEqual(["perf-b0-c500", ...movedIds]);
    expect(times.move.sync).toBeLessThan(150);
    expect(times.indent.sync).toBeLessThan(150);
    expect(times.outdent.sync).toBeLessThan(150);
    expect(times.outdent.rendered).toBeLessThan(400);
    expect(times.tailOutdent.sync).toBeLessThan(150);
    expect(times.tailOutdent.rendered).toBeLessThan(500);
  });
}

for (const mode of ["block", "edgeless"] as const) {
  test(`starts and tracks a 2,000-block drag promptly on ${mode}`, async ({ browserName, page }) => {
    test.skip(browserName !== "chromium", "The timing budget is calibrated for Chromium");
    await seedOutlineDocument(page, 1);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
    const handle = page.locator('[data-block-id="perf-b0-c0"]').getByRole("button", { name: /^Move block:/ });
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    if (!from) throw new Error("Expected drag handle geometry");
    const point = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.evaluate(() => {
      (window as unknown as { __dragStartMs: number }).__dragStartMs = 0;
      window.addEventListener("pointermove", (event) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          (window as unknown as { __dragStartMs: number }).__dragStartMs = performance.now() - event.timeStamp;
        }));
      }, { capture: true, once: true });
    });
    await page.mouse.move(point.x + 8, point.y);
    await page.waitForFunction(() => (window as unknown as { __dragStartMs: number }).__dragStartMs > 0);
    const startMs = await page.evaluate(() => (window as unknown as { __dragStartMs: number }).__dragStartMs);
    await expect(page.locator(`.${PAGE_DRAG_OVERLAY_CLASS}`)).toBeVisible();
    expect(await page.evaluate(() => {
      const event = new Event("selectstart", { cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    await page.evaluate((overlayClass) => {
      const overlay = document.querySelector<HTMLElement>(`.${overlayClass}`);
      if (!overlay) throw new Error("Expected mounted drag overlay");
      const firstY = overlay.getBoundingClientRect().top;
      (window as unknown as { __dragFollowMs: number }).__dragFollowMs = 0;
      window.addEventListener("pointermove", (event) => {
        const sample = () => {
          if (Math.abs(overlay.getBoundingClientRect().top - firstY) >= 60) {
            (window as unknown as { __dragFollowMs: number }).__dragFollowMs = performance.now() - event.timeStamp;
          } else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, { capture: true, once: true });
    }, PAGE_DRAG_OVERLAY_CLASS);
    await page.mouse.move(point.x + 8, point.y + 80);
    await page.waitForFunction(() => (window as unknown as { __dragFollowMs: number }).__dragFollowMs > 0);
    const followMs = await page.evaluate(() => (window as unknown as { __dragFollowMs: number }).__dragFollowMs);
    await page.mouse.up();
    expect(await page.evaluate(() => {
      const event = new Event("selectstart", { cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(false);
    console.log(`${mode} drag: start=${startMs.toFixed(1)} ms, follow=${followMs.toFixed(1)} ms`);
    expect(startMs).toBeLessThan(150);
    expect(followMs).toBeLessThan(80);
  });
}

test("keeps the preview in step with repeated moves across 2,000 flat blocks", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "The timing budget is calibrated for Chromium");
  await seedOutlineDocument(page, 0);
  const handle = page.locator('[data-block-id="perf-root-0"]').getByRole("button", { name: /^Move block:/ });
  await handle.scrollIntoViewIfNeeded();
  await handle.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const from = await handle.boundingBox();
  if (!from) throw new Error("Expected drag handle geometry");
  const x = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y);
  await expect(page.locator(`.${PAGE_DRAG_OVERLAY_CLASS}`)).toBeVisible();

  const samples: number[] = [];
  for (let step = 1; step <= 12; step += 1) {
    await page.evaluate((overlayClass) => {
      const overlay = document.querySelector<HTMLElement>(`.${overlayClass}`);
      if (!overlay) throw new Error("Expected drag preview");
      (window as unknown as { __previewMoveMs: number }).__previewMoveMs = 0;
      window.addEventListener("pointermove", (event) => {
        requestAnimationFrame(() => {
          if (Math.abs(overlay.getBoundingClientRect().top - (event.clientY + 12)) < 2) {
            (window as unknown as { __previewMoveMs: number }).__previewMoveMs = performance.now() - event.timeStamp;
          }
        });
      }, { capture: true, once: true });
    }, PAGE_DRAG_OVERLAY_CLASS);
    await page.mouse.move(x + 8, y + step * 12);
    await page.waitForFunction(() => (window as unknown as { __previewMoveMs: number }).__previewMoveMs > 0);
    samples.push(await page.evaluate(() => (window as unknown as { __previewMoveMs: number }).__previewMoveMs));
  }
  await page.evaluate(() => {
    const state = window as unknown as { __flatFrames: number[]; __measureFlat: boolean };
    state.__flatFrames = [];
    state.__measureFlat = true;
    const sample = (time: number) => {
      state.__flatFrames.push(time);
      if (state.__measureFlat) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (let step = 0; step < 30; step += 1) {
    await page.mouse.move(x + 8, y + 10 + step * 6);
    await page.waitForTimeout(8);
  }
  const gaps = await page.evaluate(() => {
    const state = window as unknown as { __flatFrames: number[]; __measureFlat: boolean };
    state.__measureFlat = false;
    return state.__flatFrames.slice(1).map((time, index) => time - state.__flatFrames[index]!).sort((a, b) => a - b);
  });
  await page.mouse.up();
  samples.sort((left, right) => left - right);
  console.log(`flat preview: median follow ${samples[Math.floor(samples.length / 2)]!.toFixed(1)} ms, p90 frame gap ${gaps[Math.floor(gaps.length * 0.9)]!.toFixed(1)} ms`);
  expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(40);
  expect(gaps[Math.floor(gaps.length * 0.9)]).toBeLessThan(40);
});

test("keeps auto-scroll frames responsive while dragging 2,000 flat blocks", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "The timing budget is calibrated for Chromium");
  await seedOutlineDocument(page, 0);
  const handle = page.locator('[data-block-id="perf-root-0"]').getByRole("button", { name: /^Move block:/ });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  if (!from) throw new Error("Expected drag handle geometry");
  const x = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y);
  const preview = page.locator(`.${PAGE_DRAG_OVERLAY_CLASS}`);
  await expect(preview).toBeVisible();
  await page.mouse.move(x + 8, page.viewportSize()!.height - 50, { steps: 5 });
  const previewTop = (await preview.boundingBox())!.y;
  const measurements = await page.evaluate(async () => {
    const frames: number[] = [];
    const startScroll = window.scrollY;
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const sample = (time: number) => {
        frames.push(time);
        if (time - started < 1_000) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    return {
      scroll: window.scrollY - startScroll,
      gaps: frames.slice(1).map((time, index) => time - frames[index]!).sort((a, b) => a - b),
    };
  });
  expect((await preview.boundingBox())!.y).toBeCloseTo(previewTop, 0);
  await expect(page.locator('[data-block-id="perf-root-0"]')).toHaveCount(1);
  await page.mouse.move(x + 8, page.viewportSize()!.height / 2, { steps: 5 });
  await page.waitForTimeout(100);
  const settledScroll = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.scrollY)).toBe(settledScroll);
  await page.mouse.move(x + 8, 50, { steps: 5 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(settledScroll - 100);
  await page.mouse.up();
  console.log(`flat auto-scroll: ${measurements.scroll}px, p75 frame gap ${measurements.gaps[Math.floor(measurements.gaps.length * 0.75)]!.toFixed(1)} ms`);
  expect(measurements.scroll).toBeGreaterThan(100);
  expect(measurements.gaps[Math.floor(measurements.gaps.length * 0.75)]).toBeLessThan(40);
});

for (const mode of ["block", "edgeless"] as const) {
  for (const branchCount of [0, 1, 2, 4, 8, 16]) {
    test(`keeps 2,000-block gap drag feedback responsive in ${branchCount || "flat"} branches on ${mode}`, async ({ browserName, page }) => {
      test.skip(browserName !== "chromium", "The timing budget is calibrated for Chromium");
      test.setTimeout(180_000);
      const siblings = await seedOutlineDocument(page, branchCount);
      if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
      const source = page.locator(`[data-block-id="${siblings[0]}"]`).getByRole("button", { name: /^Move block:/ });
      await source.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const sourceBox = await source.boundingBox();
      if (!sourceBox) throw new Error("Expected drag source geometry");
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.evaluate(() => {
        (window as unknown as { __activationDuration: number }).__activationDuration = 0;
        window.addEventListener("pointermove", (event) => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            (window as unknown as { __activationDuration: number }).__activationDuration = performance.now() - event.timeStamp;
          }));
        }, { capture: true, once: true });
      });
      await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 8, sourceBox.y + sourceBox.height / 2);
      await expect(page.locator(`.${PAGE_DRAG_OVERLAY_CLASS}`)).toBeVisible();
      await page.waitForFunction(() => (window as unknown as { __activationDuration: number }).__activationDuration > 0);
      const activation = await page.evaluate(() => (window as unknown as { __activationDuration: number }).__activationDuration);
      await page.evaluate(() => {
        const original = Element.prototype.querySelectorAll;
        (window as unknown as { __dragFullScans: number }).__dragFullScans = 0;
        Element.prototype.querySelectorAll = function (...args) {
          if (args[0] === "[data-block-id]") (window as unknown as { __dragFullScans: number }).__dragFullScans += 1;
          return original.apply(this, args);
        };
      });

      const samples: number[] = [];
      for (const id of siblings.slice(1)) {
        const box = await page.locator(`[data-block-id="${id}"] > .${PAGE_BLOCK_ROW_CLASS}`).boundingBox();
        if (!box) throw new Error("Expected target row geometry");
        await page.evaluate(() => {
          (window as unknown as { __feedbackDuration: number }).__feedbackDuration = 0;
          window.addEventListener("pointermove", (event) => {
            requestAnimationFrame(() => requestAnimationFrame(() => {
              (window as unknown as { __feedbackDuration: number }).__feedbackDuration = performance.now() - event.timeStamp;
            }));
          }, { capture: true, once: true });
        });
        await page.mouse.move(box.x + box.width / 2, box.y + box.height + 2);
        await page.waitForFunction(() => (window as unknown as { __feedbackDuration: number }).__feedbackDuration > 0);
        samples.push(await page.evaluate(() => (window as unknown as { __feedbackDuration: number }).__feedbackDuration));
      }
      await page.evaluate(() => {
        (window as unknown as { __commitDuration: number }).__commitDuration = 0;
        window.addEventListener("pointerup", (event) => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            (window as unknown as { __commitDuration: number }).__commitDuration = performance.now() - event.timeStamp;
          }));
        }, { capture: true, once: true });
      });
      await page.mouse.up();
      await page.waitForFunction(() => (window as unknown as { __commitDuration: number }).__commitDuration > 0);
      const commit = await page.evaluate(() => (window as unknown as { __commitDuration: number }).__commitDuration);
      samples.sort((left, right) => left - right);
      const fullScans = await page.evaluate(() => (window as unknown as { __dragFullScans: number }).__dragFullScans);
      console.log(`${branchCount || "flat"} branches drag: activation=${activation.toFixed(1)}, feedback=${samples.join(",")}, commit=${commit.toFixed(1)} ms; full scans=${fullScans}`);
      expect(fullScans).toBe(0);
      expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(160);
    });
  }
}

for (const mode of ["block", "edgeless"] as const) {
  test(`drags a tail child into the next branch with 2,000 blocks on ${mode}`, async ({ browserName, page }) => {
    test.skip(browserName !== "chromium", "The timing budget is calibrated for Chromium");
    test.setTimeout(180_000);
    await seedOutlineDocument(page, 2);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
    const source = page.locator('[data-block-id="perf-b0-c998"]');
    const target = page.locator(`[data-block-id="perf-b1"] > .${PAGE_BLOCK_ROW_CLASS}`);
    await target.scrollIntoViewIfNeeded();
    const handle = source.getByRole("button", { name: /^Move block:/ });
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("Expected adjacent branch drag geometry");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2);
    await expect(page.locator(`.${PAGE_DRAG_OVERLAY_CLASS}`)).toBeVisible();
    const start = await page.evaluate(() => performance.now());
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2);
    const feedback = await page.evaluate(async (started) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - started;
    }, start);
    await page.mouse.up();
    const parent = await page.evaluate(() => (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.blocks.getParentId("perf-b0-c998"));
    expect(parent).toBe("perf-b1");
    expect(feedback).toBeLessThan(180);
  });
}

for (const mode of ["block", "edgeless"] as const) {
  for (const branchCount of [0, 1, 2, 4, 8, 16]) {
    test(`measures structural edits with 2,000 blocks in ${branchCount || "flat"} branches on ${mode}`, async ({ browserName, page }) => {
      test.skip(browserName !== "chromium", "The timing sample is calibrated for Chromium");
      test.setTimeout(180_000);
      const siblings = await seedOutlineDocument(page, branchCount);
      if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
      const times = await page.evaluate(async ({ branches, siblings }) => {
        const editor = (window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        }).__rivtoDemo.editor;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const measure = async (action: () => void) => {
          const start = performance.now();
          action();
          const sync = performance.now() - start;
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return { sync, rendered: performance.now() - start };
        };
        const create = await measure(() => {
          editor.blocks.insertBlock({ id: "perf-new", type: "paragraph", content: "New block" }, siblings[0]);
        });
        const move = await measure(() => editor.blocks.moveBlock(siblings[0]!, siblings[1]!, "after"));
        const indent = await measure(() => editor.blocks.indentBlock(siblings[2]!));
        const outdent = await measure(() => editor.blocks.outdentBlock(siblings[branches ? 3 : 2]!));
        const createRoot = await measure(() => {
          editor.blocks.insertBlock({ id: "perf-new-root", type: "paragraph", content: "New root" }, editor.blocks.getRootIds().at(-1));
        });
        let crossMove: Awaited<ReturnType<typeof measure>> | undefined;
        let tailIndent: Awaited<ReturnType<typeof measure>> | undefined;
        let tailOutdent: Awaited<ReturnType<typeof measure>> | undefined;
        if (branches > 1) {
          const tailId = editor.blocks.getBlockNode("perf-b1")?.childIds.at(-1);
          if (!tailId) throw new Error("Expected second branch tail");
          crossMove = await measure(() => editor.blocks.moveBlock("perf-b0-c4", "perf-b1-c0", "after"));
          tailIndent = await measure(() => editor.blocks.indentBlock(tailId));
          tailOutdent = await measure(() => editor.blocks.outdentBlock(tailId));
        }
        return { create, createRoot, move, crossMove, indent, tailIndent, outdent, tailOutdent, count: document.querySelectorAll("[data-block-id]").length };
      }, { branches: branchCount, siblings });
      console.log(`${branchCount || "flat"} branches on ${mode}: ${JSON.stringify(times)}`);
      if (mode === "block" && !branchCount) expect(times.count).toBeLessThan(500);
      else expect(times.count).toBeGreaterThanOrEqual(2_000);
      expect(times.outdent.sync).toBeLessThan(500);
      expect(times.indent.sync).toBeLessThan(100);
      expect(times.createRoot.sync).toBeLessThan(100);
      if (branchCount > 1) {
        expect(times.crossMove?.sync).toBeLessThan(100);
        expect(times.tailIndent?.sync).toBeLessThan(100);
        expect(times.tailOutdent?.sync).toBeLessThan(100);
      }
      if (branchCount === 1) expect(times.outdent.rendered).toBeLessThan(1_200);
    });
  }
}
