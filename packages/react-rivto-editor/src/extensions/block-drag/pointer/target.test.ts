import type { EditorViewApi } from "../../../types";
import { resolveDropPlacement, type DropLayoutBlock, type DropRect } from "../placement/resolver";
import type { DropBlock } from "../placement/types";
import { collectDropLayout, getDropBlocks, resolveSurfaceDrop } from "./target";
import type { EditorBlock } from "@chulane/rivto";
import { resolveCrossDocumentPageRootPlacement } from "../cross-document/placement";

const defaults = { childDropIndent: 24, gapDropZone: 8, allowChildPlacement: true };
function rect(top: number, height = 24, left = 0, width = 400): DropRect {
  return { top, bottom: top + height, left, right: left + width, width, height };
}
function item(id: string, top: number, options: Partial<DropLayoutBlock> = {}): DropLayoutBlock {
  return { id, parentId: null, row: rect(top), rect: rect(top), fixed: false, acceptsBody: false, ...options };
}
function tree(items: readonly DropLayoutBlock[], parentId: string | null = null): DropBlock[] {
  return items.filter((entry) => entry.parentId === parentId).map(({ id }) => ({ id, children: tree(items, id) }));
}

/** Minimal DOM fixture counts bounding rectangle reads while retaining every rendered identity. */
function surface(items: DropLayoutBlock[]) {
  const reads: string[] = [];
  const elements = new Map<string, HTMLElement>();
  items.forEach((entry, index) => {
    const row = { getBoundingClientRect: () => { reads.push(entry.id); return items[index]!.row; } };
    elements.set(entry.id, {
      dataset: { blockId: entry.id },
      parentElement: { closest: () => elements.get(entry.parentId ?? "") ?? null },
      getClientRects: () => [items[index]!.rect],
      getBoundingClientRect: () => { reads.push(entry.id); return items[index]!.rect; },
      querySelector: (selector: string) => selector === ":scope > .page-block-row" ? row
        : items.some((child) => child.parentId === entry.id) ? {} : null,
    } as unknown as HTMLElement);
  });
  const root = {
    querySelectorAll: () => [...elements.values()],
    contains: (element: HTMLElement) => [...elements.values()].includes(element),
  } as unknown as HTMLElement;
  const runtime = {
    blocks: { getBlockNode: () => undefined },
    views: { resolve: (id: string) => {
      const entry = items.find((candidate) => candidate.id === id)!;
      return { dropAxis: entry.axis, acceptsDropContainer: entry.acceptsBody, dropPlacement: entry.options };
    } },
  } as unknown as EditorViewApi;
  return { root, runtime, reads };
}

test.each([2, 2000])("keeps complete neighbors without reading bounding rectangles of an unrelated subtree of %i blocks", (count) => {
  const items = [item("a", 0), item("b", 40), item("other", 80, { rect: rect(80, count * 40 + 40) }),
    ...Array.from({ length: count }, (_, index) => item(`child-${index}`, 120 + index * 40, { parentId: "other" }))];
  const fixture = surface(items);
  const layout = collectDropLayout(fixture.root, fixture.runtime);
  expect(layout).toHaveLength(count + 3);
  expect(resolveDropPlacement(layout, tree(items), { x: 12, y: 32 }, defaults, () => true))
    .toMatchObject({ kind: "between", parentId: null, previousId: "a", nextId: "b" });
  expect(fixture.reads.some((id) => id.startsWith("child-"))).toBe(false);
  expect(fixture.reads.length).toBeLessThan(30);
});

test.each(["vertical", "horizontal", "grid"] as const)("fresh %s geometry matches complete measurements", (axis) => {
  const items = [item("parent", 0, { axis, acceptsBody: true, rect: rect(0, 400) }),
    item("a", 40, { parentId: "parent", row: rect(40, 60, 20, 160), rect: rect(40, 60, 20, 160) }),
    item("b", axis === "vertical" ? 130 : 40, { parentId: "parent",
      row: rect(axis === "vertical" ? 130 : 40, 60, 200, 160), rect: rect(axis === "vertical" ? 130 : 40, 60, 200, 160) }),
    item("c", 160, { parentId: "parent", rect: rect(160, 60, 20, 160), row: rect(160, 60, 20, 160) }),
    item("next", 420)];
  const fixture = surface(items);
  const layout = collectDropLayout(fixture.root, fixture.runtime);
  for (const keyboard of [false, true]) {
    for (const y of [-2, 8, 32, 75, 115, 150, 380, 408]) {
      for (const x of [10, 100, 190, 210, 390]) {
        const pointer = { x, y };
        const accepts = (destination: { parentId: string | null }) => destination.parentId !== "b";
        expect(resolveDropPlacement(layout, tree(items), pointer, { ...defaults, keyboard }, accepts))
          .toEqual(resolveDropPlacement(items, tree(items), pointer, { ...defaults, keyboard }, accepts));
      }
    }
  }
  // Position changes without a new DOM identity list must still be read fresh.
  items[4] = item("next", 500);
  expect(layout[4]!.rect.top).toBe(500);
});

test.each([2, 2000])("embedded placement reads its subtree without visiting %i unrelated document roots", (count) => {
  const root = { id: "branch", children: [] } as unknown as EditorBlock;
  let nodeReads = 0;
  let forestReads = 0;
  const forest = Array.from({ length: count }, (_, index) => ({ id: `other-${index}`, children: [] }));
  const runtime = {
    rootBlockId: "branch",
    blocks: {
      getBlock: (id: string) => { nodeReads++; return id === "branch" ? root : undefined; },
      getBlocks: () => { forestReads++; return forest; },
    },
  } as unknown as EditorViewApi;
  expect(getDropBlocks(runtime)).toEqual([root]);
  expect(nodeReads).toBe(1);
  expect(forestReads).toBe(0);
});

test("retains hidden siblings when dropping before a filtered container child", () => {
  const fixture = surface([
    item("storage", 0, { acceptsBody: true, axis: "vertical", rect: rect(0, 160) }),
    item("visible", 40, { parentId: "storage" }),
  ]);
  fixture.runtime.views.acceptsDrop = () => true;
  const blocks = [{ id: "storage", children: [{ id: "hidden", children: [] }, { id: "visible", children: [] }] }];
  expect(resolveSurfaceDrop(fixture.root, fixture.runtime, [], blocks, { x: 12, y: 36 }, defaults))
    .toMatchObject({ kind: "between", parentId: "storage", previousId: "hidden", nextId: "visible" });
});

test("does not measure an outline when the pointer is over blank canvas", () => {
  const fixture = surface([item("block", 0)]);
  Object.assign(fixture.root, { getAttribute: () => "edgeless" });
  expect(resolveSurfaceDrop(fixture.root, fixture.runtime, [], [{ id: "block", children: [] }], { x: 100, y: 20 }, defaults)).toBeNull();
  expect(fixture.reads).toEqual([]);
});

test("embedded placement accepts children but refuses gaps outside the displayed root and moves into itself", () => {
  const fixture = surface([item("branch", 0, { rect: rect(0, 80) }), item("child", 40, { parentId: "branch" })]);
  const branch = { id: "branch", children: [{ id: "child", children: [] }] } as unknown as EditorBlock;
  const foreign = { id: "foreign", children: [] } as unknown as EditorBlock;
  const runtime = Object.assign(fixture.runtime, {
    rootBlockId: "branch",
    getDocument: () => ({ id: "A" }),
    blocks: { ...fixture.runtime.blocks, getBlock: () => branch },
    views: { ...fixture.runtime.views, acceptsDrop: () => true },
  }) as EditorViewApi;
  expect(resolveSurfaceDrop(fixture.root, runtime, [foreign], [branch], { x: 100, y: 52 }, defaults))
    .toMatchObject({ kind: "inside", parentId: "child" });
  expect(resolveSurfaceDrop(fixture.root, runtime, [foreign], [branch], { x: 12, y: 0 }, defaults)).toBeNull();
  expect(resolveCrossDocumentPageRootPlacement(runtime, fixture.root, 100, 52, 24, 8, true, [branch], undefined, "A")).toBeNull();
  // Identical IDs in another document are independent; do not remove that destination subtree.
  expect(resolveCrossDocumentPageRootPlacement(runtime, fixture.root, 100, 52, 24, 8, true, [branch], undefined, "B"))
    .toMatchObject({ targetId: "child", position: "inside" });
});

test("pointer drops use the visible canvas card instead of an overlapping card behind it", () => {
  const items = [item("behind", 0, { rect: rect(0, 400) }),
    item("first", 0, { rect: rect(0, 180), acceptsBody: true }), item("second", 196), item("following", 250)];
  const fixture = surface(items);
  const card = surface(items.slice(1, 3)).root;
  const contains = fixture.root.contains.bind(fixture.root);
  Object.assign(fixture.root, {
    ownerDocument: { elementFromPoint: () => ({ closest: () => card }) },
    contains: (element: HTMLElement) => element === card || contains(element),
  });
  Object.assign(fixture.runtime.views, { acceptsDrop: () => true });
  expect(resolveSurfaceDrop(fixture.root, fixture.runtime, [], tree(items), { x: 100, y: 188 }, defaults))
    .toMatchObject({ kind: "between", parentId: null, previousId: "first", nextId: "second" });
  expect(fixture.reads).not.toContain("behind");
  expect(resolveSurfaceDrop(fixture.root, fixture.runtime, [], tree(items), { x: 12, y: 2 }, defaults))
    .toMatchObject({ kind: "between", parentId: null, previousId: "behind", nextId: "first", indicatorId: "first" });
  expect(resolveSurfaceDrop(fixture.root, fixture.runtime, [], tree(items), { x: 12, y: 225 }, defaults))
    .toMatchObject({ kind: "between", parentId: null, previousId: "second", nextId: "following", indicatorId: "second" });
});
