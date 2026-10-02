import type { ReactEditor } from "../../../types";
import { resolveDropPlacement, type DropLayoutBlock, type DropRect } from "../placement/resolver";
import type { DropBlock } from "../placement/types";
import { collectDropLayout } from "./target";

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
  } as unknown as ReactEditor;
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
