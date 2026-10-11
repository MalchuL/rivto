import { resolveDropPlacement, type DropLayoutBlock, type DropLayoutOptions, type DropRect } from "./resolver";
import type { CanonicalDropPlacement, DropBlock } from "./types";

const defaults: DropLayoutOptions = { childDropIndent: 24, gapDropZone: 8, allowChildPlacement: true };
function rect(top: number, height: number, left = 0, width = 400): DropRect {
  return { top, bottom: top + height, left, right: left + width, width, height };
}
function item(id: string, top: number, height: number, options: Partial<DropLayoutBlock> = {}): DropLayoutBlock {
  return { id, parentId: null, row: rect(top, 24), rect: rect(top, height), fixed: false, acceptsBody: false, ...options };
}
function tree(items: readonly DropLayoutBlock[], parentId: string | null = null): DropBlock[] {
  return items.filter((entry) => entry.parentId === parentId).map(({ id }) => ({ id, children: tree(items, id) }));
}
function resolve(items: DropLayoutBlock[], x: number, y: number, accepts = (_: CanonicalDropPlacement) => true, options = defaults) {
  return resolveDropPlacement(items, tree(items), { x, y }, options, accepts);
}

test.each([false, true])("one-pixel sweeps keep the same container neighbors (nested=%s)", (nested) => {
  const parentId = nested ? "parent" : null;
  const items = [
    ...(nested ? [item("parent", -40, 650, { acceptsBody: true })] : []),
    item("a", 0, 180, { acceptsBody: true, parentId }),
    item("a-child", 130, 50, { parentId: "a", row: rect(130, 50) }),
    item("b", 196, 240, { fixed: true, parentId }),
    item("b-child", 220, 180, { parentId: "b", acceptsBody: true }),
    item("c", 452, 100, { acceptsBody: true, parentId }),
  ];
  for (let y = 173; y <= 203; y++) {
    expect(resolve(items, 100, y)).toMatchObject({ kind: "between", parentId, previousId: "a", nextId: "b", depth: nested ? 1 : 0 });
  }
});

test("both sides of an ordinary gap select the same neighbors", () => {
  const items = [item("a", 0, 24), item("b", 40, 24), item("c", 80, 24)];
  for (let y = 18; y <= 46; y++) {
    expect(resolve(items, 12, y)).toMatchObject({ kind: "between", parentId: null, previousId: "a", nextId: "b" });
  }
  expect(resolve(items, 100, 52)).toMatchObject({ kind: "inside", parentId: "b" });
});

test("background does not redirect to a distant lane or create a shell", () => {
  const items = [item("board", 0, 400, { fixed: true, acceptsBody: true, axis: "horizontal" }),
    item("lane", 80, 250, { parentId: "board", acceptsBody: true, rect: rect(80, 250, 20, 160), row: rect(80, 24, 20, 160) })];
  const accepts = (destination: CanonicalDropPlacement) => destination.parentId !== "board";
  expect(resolve(items, 200, 55, accepts)).toBeNull();
  expect(resolve(items, 300, 200, accepts)).toBeNull();
  expect(resolve(items, 100, 200, accepts)).toMatchObject({ kind: "inside", parentId: "lane" });
  expect(resolve([items[0]!], 100, 200, accepts)).toBeNull();
});

test("horizontal gaps reorder shells, independent of source layout axis", () => {
  const items = [item("board", 0, 300, { fixed: true, axis: "horizontal" }),
    item("a", 40, 220, { parentId: "board", acceptsBody: true, rect: rect(40, 220, 0, 180) }),
    item("b", 40, 220, { parentId: "board", acceptsBody: true, rect: rect(40, 220, 200, 180) })];
  for (let x = 174; x <= 206; x++) expect(resolve(items, x, 140)).toMatchObject({ parentId: "board", previousId: "a", nextId: "b", line: { axis: "vertical", x: 190 } });
});

test("grid gaps follow document order across wrapped rows", () => {
  const items = [item("grid", 0, 300, { fixed: true, acceptsBody: true, axis: "grid" }),
    item("a", 40, 80, { parentId: "grid", row: rect(40, 80, 0, 180), rect: rect(40, 80, 0, 180) }),
    item("b", 40, 80, { parentId: "grid", row: rect(40, 80, 200, 180), rect: rect(40, 80, 200, 180) }),
    item("c", 140, 80, { parentId: "grid", row: rect(140, 80, 0, 180), rect: rect(140, 80, 0, 180) })];
  expect(resolve(items, 190, 80)).toMatchObject({ previousId: "a", nextId: "b", line: { axis: "vertical" } });
  expect(resolve(items, 100, 130)).toMatchObject({ previousId: "b", nextId: "c", line: { axis: "horizontal" } });
  expect(resolve(items, 80, 80)).toMatchObject({ kind: "inside", parentId: "a" });
});

test("outline depths stay on the same subtree boundary", () => {
  const items = [item("a", 0, 104), item("b", 40, 64, { parentId: "a", row: rect(40, 24, 24) }),
    item("c", 80, 24, { parentId: "b", row: rect(80, 24, 48), rect: rect(80, 24, 48) }), item("d", 120, 24)];
  expect(resolve(items, 12, 110)).toMatchObject({ parentId: null, previousId: "a", nextId: "d" });
  expect(resolve(items, 36, 110)).toMatchObject({ parentId: "a", previousId: "b", nextId: null });
  expect(resolve(items, 72, 110)).toMatchObject({ parentId: "c", previousId: null, nextId: null });
});

test("excluded and collapsed children are not target regions", () => {
  const items = [item("a", 0, 100, { hasRenderedChildren: true }), item("b", 116, 24)];
  const blocks = [{ id: "a", children: [{ id: "hidden", children: [] }] }, { id: "b", children: [] }];
  expect(resolveDropPlacement(items, blocks, { x: 12, y: 22 }, defaults, () => true)).toMatchObject({ previousId: "a", nextId: "b", line: { y: 24 } });
  expect(resolveDropPlacement(items, [{ id: "b", children: [] }], { x: 12, y: 4 }, defaults, () => true)).toMatchObject({ previousId: null, nextId: "b" });
});

test("keyboard uses item halves and rejected destinations have no indicator", () => {
  const items = [item("a", 0, 24), item("b", 40, 24)];
  expect(resolve(items, 100, 54, () => true, { ...defaults, keyboard: true })).toMatchObject({ previousId: "b", nextId: null });
  expect(resolve(items, 100, 54, () => false)).toBeNull();
});

test("disabled child placement keeps row-center drops at sibling depth", () => {
  const items = [item("a", 0, 24), item("b", 40, 24)];
  expect(resolve(items, 100, 54, () => true, { ...defaults, allowChildPlacement: false }))
    .toMatchObject({ kind: "between", parentId: null, previousId: "b", nextId: null });
  items[1] = { ...items[1]!, options: { allowChildPlacement: false } };
  expect(resolve(items, 100, 54)).toMatchObject({ kind: "between", parentId: null, previousId: "b" });
  expect(resolve(items, 100, 62)).toMatchObject({ kind: "between", parentId: null, previousId: "b" });
});

test("an indented gap stays between siblings when the preceding block rejects children", () => {
  const items = [item("restricted", 0, 180), item("next", 196, 24)];
  for (const y of [178, 188, 198]) {
    expect(resolve(items, 200, y, (destination) => destination.parentId !== "restricted"))
      .toMatchObject({ kind: "between", parentId: null, previousId: "restricted", nextId: "next" });
  }
});

test.each([
  { acceptsBody: true },
  { fixed: true },
  {},
])("an outline gap allows nesting before the next block (%j)", (nextOptions) => {
  const items = [item("previous", 0, 24), item("next", 40, 180, nextOptions)];
  const accepts = (destination: CanonicalDropPlacement) => destination.parentId !== "next";
  for (const y of [22, 32, 42]) {
    expect(resolve(items, 12, y, accepts)).toMatchObject({ kind: "between", parentId: null, previousId: "previous", nextId: "next" });
    expect(resolve(items, 36, y, accepts)).toMatchObject({ kind: "between", parentId: "previous", previousId: null, nextId: null, line: { x: 24, y: 24 } });
  }
});

test("exposed leaf padding supports sibling and child outline gaps", () => {
  const items = [item("embedding", 0, 180), item("next", 196, 24)];
  expect(resolve(items, 12, 164)).toMatchObject({ kind: "between", parentId: null, previousId: "embedding", nextId: "next" });
  expect(resolve(items, 36, 164)).toMatchObject({ kind: "between", parentId: "embedding", previousId: null, nextId: null, line: { x: 24, y: 180 } });
});
