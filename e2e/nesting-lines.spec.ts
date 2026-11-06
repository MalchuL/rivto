import { expect, test } from "@playwright/test";
import type { ReactEditorApi } from "@chulane/rivto-react";

test("shows child-level lines and updates them on collapse and nested scroll", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  const ids = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { reactEditor: ReactEditorApi } })
      .__rivtoDemo.reactEditor;
    const parent = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Child" }],
    });
    const next = editor.blocks.insertBlock({ type: "paragraph", content: "Next" });
    editor.load({ ...editor.dump(), blocks: [parent, next], elements: [], rootElementIds: [] });
    return { parent: parent.id, child: parent.children[0]!.id, next: next.id };
  });
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  const parent = surface.locator(`[data-block-id="${ids.parent}"]`);
  const child = surface.locator(`[data-block-id="${ids.child}"]`);
  const next = surface.locator(`[data-block-id="${ids.next}"]`);
  const path = page.locator("[data-nesting-lines] path").first();
  await expect.poll(() => path.getAttribute("d")).toMatch(/^M [-\d.]+ [-\d.]+ V [-\d.]+$/);
  const geometry = async () => {
    return page.evaluate(
      ({ parentId, childId, nextId }) => {
        const surface = document.querySelector('[data-journal-document="today"] > .page-surface')!;
        const row = (id: string) =>
          surface
            .querySelector(`[data-block-id="${id}"] > .rivto-block-row`)!
            .getBoundingClientRect();
        const path = document.querySelector<SVGPathElement>("[data-nesting-lines] path")!;
        const origin = path.ownerSVGElement!.getBoundingClientRect();
        const values = path
          .getAttribute("d")!
          .match(/-?[\d.]+/g)!
          .map(Number);
        return {
          values,
          expected: [
            row(childId).left - origin.left,
            row(parentId).bottom - origin.top,
            row(nextId).top - origin.top,
          ],
          width: getComputedStyle(path).strokeWidth,
          pointer: getComputedStyle(path.ownerSVGElement!).pointerEvents,
        };
      },
      { parentId: ids.parent, childId: ids.child, nextId: ids.next },
    );
  };
  const initial = await geometry();
  initial.values.forEach((value, index) => expect(value).toBeCloseTo(initial.expected[index]!, 1));
  expect(initial.width).toBe("4px");
  expect(initial.pointer).toBe("none");
  await child.locator(":scope > .rivto-block-row").evaluate((row: HTMLElement) => {
    row.dataset.controlsPlacement = "inside";
    row.style.setProperty("--rivto-block-control-size", "28px");
  });
  await expect.poll(async () => (await geometry()).values[0]).not.toBe(initial.values[0]);
  const inset = await page.evaluate((id) => {
    const row = document.querySelector<HTMLElement>(`[data-block-id="${id}"] > .rivto-block-row`)!;
    const content = row.querySelector<HTMLElement>(":scope > .rivto-block-content")!;
    const style = getComputedStyle(row);
    const overlay = document.querySelector<SVGSVGElement>("[data-nesting-lines]")!;
    return (
      content.getBoundingClientRect().left -
      parseFloat(style.paddingInlineStart) -
      parseFloat(style.columnGap) -
      overlay.getBoundingClientRect().left
    );
  }, ids.child);
  expect((await geometry()).values[0]).toBeCloseTo(inset, 1);
  await child.locator(":scope > .rivto-block-row").evaluate((row: HTMLElement) => {
    delete row.dataset.controlsPlacement;
    row.style.removeProperty("--rivto-block-control-size");
  });
  await expect.poll(async () => (await geometry()).values[0]).toBeCloseTo(initial.values[0]!, 1);
  await parent.locator(":scope > .rivto-block-row .page-collapse-toggle").click();
  await expect(path).toHaveAttribute("d", "");
  await parent.locator(":scope > .rivto-block-row .page-collapse-toggle").click();
  await expect(child).toBeVisible();
  await expect.poll(() => path.getAttribute("d")).not.toBe("");
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".journal-stack")!;
    scroller.style.height = "150px";
    scroller.style.overflowY = "auto";
    scroller.scrollTop = 60;
  });
  await expect.poll(async () => (await geometry()).values[1]).not.toBe(initial.values[1]);
  const scrolled = await geometry();
  scrolled.values.forEach((value, index) =>
    expect(value).toBeCloseTo(scrolled.expected[index]!, 1),
  );
  await expect(next).toHaveCount(1);
  await page.getByRole("button", { name: "Edgeless" }).click();
  await expect(page.locator("[data-nesting-lines] path").first()).toHaveAttribute("d", /^M /);
});

test("draws every expanded level through the final subtree", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  const ids = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { reactEditor: ReactEditorApi } })
      .__rivtoDemo.reactEditor;
    const parent = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [
        { type: "paragraph", content: "Child", children: [{ type: "paragraph", content: "Leaf" }] },
      ],
    });
    editor.load({ ...editor.dump(), blocks: [parent], elements: [], rootElementIds: [] });
    return { parent: parent.id, child: parent.children[0]!.id };
  });
  const path = page.locator("[data-nesting-lines] path").first();
  await expect.poll(async () => (await path.getAttribute("d"))?.match(/\bM /g)?.length).toBe(2);
  const measured = await page.evaluate(
    ({ parentId, childId }) => {
      const surface = document.querySelector<HTMLElement>(
        '[data-journal-document="today"] > .page-surface',
      )!;
      const parent = surface.querySelector<HTMLElement>(`[data-block-id="${parentId}"]`)!;
      const child = surface.querySelector<HTMLElement>(`[data-block-id="${childId}"]`)!;
      const path = document.querySelector<SVGPathElement>("[data-nesting-lines] path")!;
      const origin = path.ownerSVGElement!.getBoundingClientRect();
      const ends = [...path.getAttribute("d")!.matchAll(/ V ([-\d.]+)/g)].map((match) =>
        Number(match[1]),
      );
      const embedding = document.createElement("div");
      embedding.style.background =
        "color-mix(in srgb, var(--rivto-muted) 65%, var(--rivto-background))";
      surface.append(embedding);
      const background = getComputedStyle(embedding).backgroundColor;
      embedding.remove();
      return {
        ends,
        expected: [
          parent.getBoundingClientRect().bottom - origin.top,
          child.getBoundingClientRect().bottom - origin.top,
        ],
        stroke: getComputedStyle(path).stroke,
        background,
      };
    },
    { parentId: ids.parent, childId: ids.child },
  );
  measured.ends.forEach((end, index) => expect(end).toBeCloseTo(measured.expected[index]!, 1));
  expect(measured.stroke).toBe(measured.background);
});

for (const type of ["bento", "table"] as const) {
  test(`skips the ${type} layout but draws ordinary nested outlines inside it`, async ({
    page,
  }) => {
    await page.goto("/?test_features=1");
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    const ids = await page.evaluate((type) => {
      const editor = (window as unknown as { __rivtoDemo: { reactEditor: ReactEditorApi } })
        .__rivtoDemo.reactEditor;
      const nested = {
        type: "paragraph",
        content: "Nested parent",
        children: [{ type: "paragraph", content: "Nested child" }],
      };
      const children =
        type === "table"
          ? [{ type: "table-row", children: [{ type: "table-cell", children: [nested] }] }]
          : [nested, { type: "paragraph", content: "Adjacent tile" }];
      const container = editor.blocks.insertBlock({ type, children });
      editor.load({ ...editor.dump(), blocks: [container], elements: [], rootElementIds: [] });
      let parent = container.children[0]!;
      if (type === "table") {
        parent = parent.children[0]!.children[0]!;
      }
      return { container: container.id, parent: parent.id, child: parent.children[0]!.id };
    }, type);
    const path = page.locator("[data-nesting-lines] path").first();
    await expect(page.locator(`[data-block-id="${ids.child}"]`)).toBeVisible();
    await expect
      .poll(async () => (await path.getAttribute("d"))?.match(/\bM /g)?.length)
      .toBe(type === "table" ? 2 : 1);
    const readLine = () =>
      page.evaluate(
        ({ parentId, childId }) => {
          const path = document.querySelector<SVGPathElement>("[data-nesting-lines] path")!;
          const origin = path.ownerSVGElement!.getBoundingClientRect();
          const row = (id: string) =>
            document
              .querySelector(`[data-block-id="${id}"] > .rivto-block-row`)!
              .getBoundingClientRect();
          return {
            d: path.getAttribute("d")!,
            x: (() => {
              const element = document.querySelector<HTMLElement>(
                `[data-block-id="${childId}"] > .rivto-block-row`,
              )!;
              const content = element.querySelector<HTMLElement>(":scope > .rivto-block-content")!;
              const style = getComputedStyle(element);
              return (
                content.getBoundingClientRect().left -
                parseFloat(style.paddingInlineStart) -
                parseFloat(style.columnGap) -
                origin.left
              );
            })(),
            y: row(parentId).bottom - origin.top,
            end:
              document.querySelector(`[data-block-id="${parentId}"]`)!.getBoundingClientRect()
                .bottom - origin.top,
          };
        },
        { parentId: ids.parent, childId: ids.child },
      );
    await expect
      .poll(async () => {
        const line = await readLine();
        return line.d.includes(`M ${line.x} ${line.y} V `);
      })
      .toBe(true);
    const line = await readLine();
    if (type === "bento") {
      expect(line.d).toContain(`M ${line.x} ${line.y} V ${line.end}`);
    }
    const container = page.locator(`[data-block-id="${ids.container}"]`);
    await container.locator(":scope > .rivto-block-row .page-collapse-toggle").click();
    await expect(page.locator(`[data-block-id="${ids.child}"]`)).toHaveCount(0);
    await expect(path).toHaveAttribute("d", "");
    await container.locator(":scope > .rivto-block-row .page-collapse-toggle").click();
    await expect
      .poll(async () => (await path.getAttribute("d"))?.match(/\bM /g)?.length)
      .toBe(type === "table" ? 2 : 1);
  });
}

test("draws nesting lines in an edgeless block card", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] .page-surface').first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { reactEditor: ReactEditorApi } })
      .__rivtoDemo.reactEditor;
    const parent = editor.blocks.insertBlock({
      id: "line-parent",
      type: "paragraph",
      content: "Parent",
      children: [{ id: "line-child", type: "paragraph", content: "Child" }],
    });
    const other = editor.blocks.insertBlock({
      id: "line-other",
      type: "paragraph",
      content: "Other",
      children: [{ id: "line-other-child", type: "paragraph", content: "Other child" }],
    });
    const separator = editor.blocks.insertBlock({ id: "line-separator", type: "separator" });
    editor.load({
      ...editor.dump(),
      blocks: [parent, separator, other],
      elements: [
        {
          id: "line-card",
          type: "block",
          childIds: [],
          zIndex: 0,
          frame: { x: 20, y: 20, width: 300, height: 400 },
          props: { startBlockId: "line-parent", endBlockId: "line-parent" },
        },
        {
          id: "line-other-card",
          type: "block",
          childIds: [],
          zIndex: 1,
          frame: { x: 360, y: 20, width: 300, height: 400 },
          props: { startBlockId: "line-other", endBlockId: "line-other" },
        },
      ],
      rootElementIds: ["line-card", "line-other-card"],
    });
  });
  await page.getByRole("button", { name: "Edgeless", exact: true }).click();
  await expect(
    page.locator('[data-edgeless-card-content] [data-block-id="line-child"]'),
  ).toBeVisible();
  await expect(page.locator("[data-edgeless-card-content]")).toHaveCount(2);
  const path = page.locator("[data-nesting-lines] path").first();
  await expect.poll(async () => (await path.getAttribute("d"))?.match(/\bM /g)?.length).toBe(2);
  const alignment = () =>
    page.evaluate(() => {
      const path = document.querySelector<SVGPathElement>("[data-nesting-lines] path")!;
      const origin = path.ownerSVGElement!.getBoundingClientRect();
      const row = document.querySelector<HTMLElement>(
        '[data-block-id="line-child"] > .rivto-block-row',
      )!;
      const content = row.querySelector<HTMLElement>(":scope > .rivto-block-content")!;
      const style = getComputedStyle(row);
      const scale = row.getBoundingClientRect().width / row.offsetWidth;
      const expected =
        content.getBoundingClientRect().left -
        (parseFloat(style.paddingInlineStart) + parseFloat(style.columnGap)) * scale -
        origin.left;
      return { actual: Number(path.getAttribute("d")!.match(/^M\s+([-\d.]+)/)![1]), expected };
    });
  let measured = await alignment();
  expect(measured.actual).toBeCloseTo(measured.expected, 1);
  const before = await path.getAttribute("d");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => path.getAttribute("d")).not.toBe(before);
  await expect.poll(async () => (await path.getAttribute("d"))?.match(/\bM /g)?.length).toBe(2);
  measured = await alignment();
  expect(measured.actual).toBeCloseTo(measured.expected, 1);
  const zoomed = await path.getAttribute("d");
  const viewport = (await page.locator(".edgeless-viewport").boundingBox())!;
  await page.mouse.move(viewport.x + viewport.width - 30, viewport.y + viewport.height - 30);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(viewport.x + viewport.width - 70, viewport.y + viewport.height - 60);
  await page.mouse.up({ button: "middle" });
  await expect.poll(() => path.getAttribute("d")).not.toBe(zoomed);
  measured = await alignment();
  expect(measured.actual).toBeCloseTo(measured.expected, 1);
});

for (const type of ["bento", "kanban"] as const) {
  test(`aligns a nested outline inside ${type} in Edgeless`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.locator('[data-journal-document="today"] .page-surface').first().waitFor();
    await page.evaluate((type) => {
      const editor = (window as unknown as { __rivtoDemo: { reactEditor: ReactEditorApi } })
        .__rivtoDemo.reactEditor;
      const writing = {
        id: "nested-writing",
        type: "paragraph",
        content: "Parent",
        children: [{ id: "nested-child", type: "paragraph", content: "Child" }],
      };
      const children =
        type === "kanban"
          ? [{ id: "nested-lane", type: "kanban-column", content: "Lane", children: [writing] }]
          : [writing];
      const container = editor.blocks.insertBlock({ id: "nested-container", type, children });
      editor.load({ ...editor.dump(), blocks: [container], elements: [], rootElementIds: [] });
      editor.elements.insertElement({
        type: "block",
        zIndex: 0,
        frame: { x: 20, y: 20, width: 700, height: 500 },
        props: { startBlockId: "nested-container", endBlockId: "nested-container" },
      });
    }, type);
    await page.getByRole("button", { name: "Edgeless", exact: true }).click();
    await expect(page.locator('[data-block-id="nested-child"]')).toBeVisible();
    const path = page.locator("[data-nesting-lines] path").first();
    await expect.poll(() => path.getAttribute("d")).toMatch(/^M /);
    const result = await page.evaluate(() => {
      const path = document.querySelector<SVGPathElement>("[data-nesting-lines] path")!;
      const origin = path.ownerSVGElement!.getBoundingClientRect();
      const row = document.querySelector<HTMLElement>(
        '[data-block-id="nested-child"] > .rivto-block-row',
      )!;
      const content = row.querySelector<HTMLElement>(":scope > .rivto-block-content")!;
      const style = getComputedStyle(row);
      const scale = row.getBoundingClientRect().width / row.offsetWidth;
      return {
        actual: Number(path.getAttribute("d")!.match(/^M\s+([-\d.]+)/)![1]),
        expected:
          content.getBoundingClientRect().left -
          (parseFloat(style.paddingInlineStart) + parseFloat(style.columnGap)) * scale -
          origin.left,
      };
    });
    expect(result.actual).toBeCloseTo(result.expected, 1);
  });
}

test("aligns nesting lines with right-to-left inline controls", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] .page-surface').first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { reactEditor: ReactEditorApi } })
      .__rivtoDemo.reactEditor;
    const parent = editor.blocks.insertBlock({
      id: "rtl-parent",
      type: "paragraph",
      content: "Parent",
      children: [{ id: "rtl-child", type: "paragraph", content: "Child" }],
    });
    editor.load({ ...editor.dump(), blocks: [parent], elements: [], rootElementIds: [] });
  });
  const row = page.locator('[data-block-id="rtl-child"] > .rivto-block-row');
  await row.evaluate((element: HTMLElement) => {
    element.style.direction = "rtl";
    element.dataset.controlsPlacement = "inside";
  });
  const path = page.locator("[data-nesting-lines] path").first();
  await expect.poll(async () => path.getAttribute("d")).toMatch(/^M /);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const row = document.querySelector<HTMLElement>(
          '[data-block-id="rtl-child"] > .rivto-block-row',
        )!;
        const content = row.querySelector<HTMLElement>(":scope > .rivto-block-content")!;
        const style = getComputedStyle(row);
        const overlay = document.querySelector<SVGSVGElement>("[data-nesting-lines]")!;
        const path = overlay.querySelector("path")!;
        const expected =
          content.getBoundingClientRect().right +
          parseFloat(style.paddingInlineStart) +
          parseFloat(style.columnGap) -
          overlay.getBoundingClientRect().left;
        return Math.abs(Number(path.getAttribute("d")!.match(/^M\s+([-\d.]+)/)![1]) - expected);
      }),
    )
    .toBeLessThan(0.5);
});
