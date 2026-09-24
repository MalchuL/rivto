import { expect, test } from "@playwright/test";

test("draws one continuous top-level line to the focused root", async ({ page }) => {
  await page.goto("/");
  const roots = page.locator(".page-surface > .page-block");
  const focused = page.locator(".page-surface > .page-block:has(> .page-block-children)").first();
  await focused.locator(":scope > .page-block-row [data-block-content]").click();
  const path = page.locator("[data-bullet-threading] path");
  await expect.poll(() => path.getAttribute("d")).toMatch(/^M .* V .* Q .* H .*$/);
  const d = (await path.getAttribute("d"))!;
  expect(await roots.count()).toBeGreaterThan(2);
  expect((d.match(/\bM /g) ?? []).length).toBe(1);
  const endpointX = await focused.locator(":scope > .page-block-row .page-collapse-toggle").evaluate((control) => {
    const rect = control.getBoundingClientRect();
    const overlay = document.querySelector("[data-bullet-threading]")!.getBoundingClientRect();
    return rect.x + rect.width / 2 - overlay.x;
  });
  const trunkX = Number(/^M ([\d.]+)/.exec(d)![1]);
  expect(trunkX).toBeLessThan(endpointX);
  expect(endpointX - trunkX).toBeCloseTo(12, 1);
  expect(Number(d.split(" H ").at(-1))).toBeCloseTo(endpointX, 1);
});

test("rootLineOffset moves the root line in focused and all resolutions", async ({ page }) => {
  await page.goto("/?threadRootLineOffset=20");
  const focused = page.locator(".page-surface > .page-block:has(> .page-block-children)").first();
  await focused.locator(":scope > .page-block-row [data-block-content]").click();
  const path = page.locator("[data-bullet-threading] path");
  await expect.poll(() => path.getAttribute("d")).toMatch(/^M .* Q .* H .*$/);
  const x = await focused.locator(":scope > .page-block-row .page-collapse-toggle").evaluate((control) => {
    const rect = control.getBoundingClientRect();
    return rect.x + rect.width / 2;
  });
  expect(x - Number(/^M ([\d.]+)/.exec((await path.getAttribute("d"))!)![1])).toBeCloseTo(20, 1);

  await page.goto("/?threadResolution=all&threadRootLineOffset=20");
  await expect.poll(() => path.getAttribute("d")).toMatch(/^M .* Q .* H .*$/);
  expect(x - Number(/^M ([\d.]+)/.exec((await path.getAttribute("d"))!)![1])).toBeCloseTo(20, 1);
});

test("threads only the focused page ancestry and follows its controls", async ({ page }) => {
  await page.goto("/");
  const parent = page.locator(".page-surface > .page-block:has(> .page-block-children)").first();
  const child = parent.locator(":scope > .page-block-children > .page-block").first();
  const content = child.locator(":scope > .page-block-row [data-block-content]");
  const path = page.locator("[data-bullet-threading] path");

  await content.click();
  await expect.poll(() => path.getAttribute("d")).toMatch(/^M .* Q .* H .*$/);
  const positions = await page.evaluate(() => {
    const parent = document.querySelector(".page-surface > .page-block:has(> .page-block-children)")!;
    const child = parent.querySelector(":scope > .page-block-children > .page-block")!;
    const toggle = parent.querySelector(":scope > .page-block-row .page-collapse-toggle")!.getBoundingClientRect();
    const childToggle = child.querySelector(":scope > .page-block-row .page-collapse-toggle")!.getBoundingClientRect();
    const overlay = document.querySelector("[data-bullet-threading]")!.getBoundingClientRect();
    return { from: toggle.x + toggle.width / 2 - overlay.x, to: childToggle.x + childToggle.width / 2 - overlay.x };
  });
  const d = await path.getAttribute("d");
  const curves = [...(d ?? "").matchAll(/ Q (-?[\d.]+)/g)];
  expect(curves).toHaveLength(2);
  expect(Number(curves.at(-1)![1])).toBeCloseTo(positions.from, 1);
  expect(Number(d?.split(" H ").at(-1))).toBeCloseTo(positions.to, 1);
  expect((d?.match(/\bM /g) ?? []).length).toBe(1);

  const leaf = child.locator(".page-block:not(:has(> .page-block-children))").first();
  await leaf.locator(":scope > .page-block-row [data-block-content]").click();
  const leafDragX = await leaf.locator(":scope > .page-block-row .page-drag-handle").evaluate((control) => {
    const rect = control.getBoundingClientRect();
    const overlay = document.querySelector("[data-bullet-threading]")!.getBoundingClientRect();
    return rect.x + rect.width / 2 - overlay.x;
  });
  await expect.poll(async () => Number((await path.getAttribute("d"))?.split(" H ").at(-1)))
    .toBeCloseTo(leafDragX, 1);

  const pathBeforeScroll = await path.getAttribute("d");
  await page.evaluate(async () => {
    window.scrollBy(0, 150);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  expect(await path.getAttribute("d")).toBe(pathBeforeScroll);
  const alignedAfterScroll = await leaf.locator(":scope > .page-block-row .page-drag-handle").evaluate((control) => {
    const anchor = control.getBoundingClientRect();
    const overlay = document.querySelector("[data-bullet-threading]")!.getBoundingClientRect();
    return overlay.x + Number(document.querySelector("[data-bullet-threading] path")!.getAttribute("d")!.split(" H ").at(-1))
      - (anchor.x + anchor.width / 2);
  });
  expect(Math.abs(alignedAfterScroll)).toBeLessThan(0.1);

  await parent.locator(":scope > .page-block-row .page-collapse-toggle").click();
  await expect(path).toHaveAttribute("d", "");
  await page.getByRole("button", { name: "Edgeless" }).click();
  await expect(page.locator("[data-bullet-threading]")).toHaveCount(0);
});

test("repositions the path for a nested scroll container", async ({ page }) => {
  await page.goto("/");
  const leaf = page.locator(".page-surface > .page-block:has(> .page-block-children)").first()
    .locator(".page-block:not(:has(> .page-block-children))").first();
  await leaf.locator("[data-block-content]").click();
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".journal-stack")!;
    scroller.style.height = "400px";
    scroller.style.overflowY = "auto";
  });
  const path = page.locator("[data-bullet-threading] path");
  const before = await path.getAttribute("d");
  await page.evaluate(() => { document.querySelector<HTMLElement>(".journal-stack")!.scrollTop = 120; });
  await expect.poll(() => path.getAttribute("d")).not.toBe(before);
  const endpointY = Number(/Q [\d.-]+ ([\d.-]+) [\d.-]+ [\d.-]+ H [\d.-]+$/.exec((await path.getAttribute("d"))!)![1]);
  const anchorY = await leaf.locator(":scope > .page-block-row .page-drag-handle").evaluate((control) => {
    const rect = control.getBoundingClientRect();
    const overlay = document.querySelector("[data-bullet-threading]")!.getBoundingClientRect();
    return rect.y + rect.height / 2 - overlay.y;
  });
  expect(endpointY).toBeCloseTo(anchorY, 1);
});

for (const anchor of ["drag", "left-top"] as const) {
  test(`aligns the path to the ${anchor} anchor`, async ({ page }) => {
    await page.goto(`/?threadAnchor=${anchor}`);
    const parent = page.locator(".page-surface > .page-block:has(> .page-block-children)").first();
    const child = parent.locator(":scope > .page-block-children > .page-block").first();
    await child.locator(":scope > .page-block-row [data-block-content]").click();
    const path = page.locator("[data-bullet-threading] path");
    await expect.poll(() => path.getAttribute("d")).toMatch(/ H [\d.]+$/);
    const endpoint = Number((await path.getAttribute("d"))!.split(" H ").at(-1));
    const target = anchor === "drag"
      ? ":scope > .page-block-row .page-drag-handle"
      : ':scope > .page-block-row > .rivto-slot[data-slot-position="left-top"]';
    const targetX = await child.locator(target).evaluate((control) => {
      const rect = control.getBoundingClientRect();
      const overlay = document.querySelector("[data-bullet-threading]")!.getBoundingClientRect();
      return rect.x + rect.width / 2 - overlay.x;
    });
    expect(endpoint).toBeCloseTo(targetX, 1);
  });
}

test("all renders without focus and none mounts no overlay", async ({ page }) => {
  await page.goto("/?threadResolution=all");
  const path = page.locator("[data-bullet-threading] path");
  await expect.poll(async () => (await path.getAttribute("d"))?.match(/ Q /g)?.length ?? 0)
    .toBeGreaterThan(await page.locator(".page-surface > .page-block").count());
  await page.goto("/?threadResolution=none");
  await expect(page.locator("[data-bullet-threading]")).toHaveCount(0);
});

test("wrapped and direct container roots keep the root line but stop before descendants", async ({ page }) => {
  for (const [type, query] of [
    ["table", ""], ["kanban", ""], ["columns", ""], ["bento", ""], ["todo-storage", ""],
    ["columns", "?threadContinue=paragraph&threadContinue=columns&threadContinue=columns-column"],
  ]) {
    await page.goto(`/${query}`);
    const container = page.locator(`.page-surface .page-block[data-block-type="${type}"]`).first();
    await container.locator('[data-block-content]').first().click();
    const path = page.locator("[data-bullet-threading] path");
    await expect.poll(() => path.getAttribute("d")).toMatch(/^M .* V .* Q .* H [\d.]+$/);
    const d = (await path.getAttribute("d"))!;
    expect((d.match(/\bM /g) ?? []).length).toBe(1);
    const anchor = await container.locator(":scope > .page-block-row .page-collapse-toggle").evaluate((control) => {
      const rect = control.getBoundingClientRect();
      const overlay = document.querySelector("[data-bullet-threading]")!.getBoundingClientRect();
      return { x: rect.x + rect.width / 2 - overlay.x, y: rect.y + rect.height / 2 - overlay.y };
    });
    expect(Number(d.split(" H ").at(-1))).toBeCloseTo(anchor.x, 1);
    expect(Number(/^M [-\d.]+ ([-\d.]+)/.exec(d)![1])).toBeLessThan(anchor.y - 100);
  }
});
