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
  await expect(page.locator(`[data-block-id="${siblings[5]}"]`)).toHaveCount(1);
  return siblings;
}

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
  await page.mouse.up();
  samples.sort((left, right) => left - right);
  console.log(`flat preview frames: ${samples.map((sample) => sample.toFixed(1)).join(", ")} ms`);
  expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(40);
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
  await expect(page.locator(`.${PAGE_DRAG_OVERLAY_CLASS}`)).toBeVisible();
  await page.mouse.move(x + 8, page.viewportSize()!.height - 12, { steps: 5 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1_000 });
  await cdp.send("Profiler.start");
  await page.evaluate(() => {
    const original = Document.prototype.elementsFromPoint;
    (window as unknown as { __hitTests: { count: number; ms: number } }).__hitTests = { count: 0, ms: 0 };
    Document.prototype.elementsFromPoint = function (x, y) {
      const start = performance.now();
      const result = original.call(this, x, y);
      const metric = (window as unknown as { __hitTests: { count: number; ms: number } }).__hitTests;
      metric.count += 1;
      metric.ms += performance.now() - start;
      return result;
    };
  });
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
  const { profile } = await cdp.send("Profiler.stop");
  console.log("CPU PROFILE", profile.nodes
    .map((node) => ({ name: node.callFrame.functionName, url: node.callFrame.url, hits: node.hitCount ?? 0 }))
    .sort((a, b) => b.hits - a.hits).slice(0, 25));
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map(profile.nodes.flatMap((node) => (node.children ?? []).map((child) => [child, node.id] as const)));
  console.log("HOT STACKS", profile.nodes.filter((node) => ["Tae", "elementFromPoint"].includes(node.callFrame.functionName)).map((node) => {
    const stack = [];
    let current: typeof node | undefined = node;
    while (current && stack.length < 8) {
      stack.push(`${current.callFrame.functionName || "anonymous"}:${current.hitCount ?? 0}`);
      current = nodes.get(parents.get(current.id) ?? -1);
    }
    return stack.join(" <- ");
  }));
  console.log("HIT TESTS", await page.evaluate(() => (window as unknown as { __hitTests: { count: number; ms: number } }).__hitTests));
  await page.mouse.up();
  console.log(`flat auto-scroll: ${measurements.scroll}px; frame gaps ${measurements.gaps.map((gap) => gap.toFixed(1)).join(", ")} ms`);
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
      expect(times.count).toBeGreaterThanOrEqual(2_000);
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
