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
  await expect(page.locator("[data-nesting-lines]")).toHaveCount(0);
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
    const line = await page.evaluate(
      ({ parentId, childId }) => {
        const path = document.querySelector<SVGPathElement>("[data-nesting-lines] path")!;
        const origin = path.ownerSVGElement!.getBoundingClientRect();
        const row = (id: string) =>
          document
            .querySelector(`[data-block-id="${id}"] > .rivto-block-row`)!
            .getBoundingClientRect();
        return {
          d: path.getAttribute("d")!,
          x: row(childId).left - origin.left,
          y: row(parentId).bottom - origin.top,
          end:
            document.querySelector(`[data-block-id="${parentId}"]`)!.getBoundingClientRect()
              .bottom - origin.top,
        };
      },
      { parentId: ids.parent, childId: ids.child },
    );
    expect(line.d).toContain(`M ${line.x} ${line.y} V `);
    if (type === "bento") {
      expect(line.d).toContain(`M ${line.x} ${line.y} V ${line.end}`);
    }
    const container = page.locator(`[data-block-id="${ids.container}"]`);
    await container.locator(":scope > .rivto-block-row .page-collapse-toggle").click();
    await expect(page.locator(`[data-block-id="${ids.child}"]`)).toHaveCount(0);
    await expect(path).toHaveAttribute("d", "");
    await container.locator(":scope > .rivto-block-row .page-collapse-toggle").click();
    await expect.poll(async () => (await path.getAttribute("d"))?.match(/\bM /g)?.length).toBe(type === "table" ? 2 : 1);
  });
}
