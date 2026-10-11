import type { EditorElementNode } from "@chulane/rivto";
import { ElementGeometry } from "./element-geometry";
import { rotatePoint } from "./visuals/utils/geometry";

function fixture() {
  const nodes = new Map<string, EditorElementNode>();
  const put = (id: string, x: number, children: string[] = [], rotation = 30) => {
    nodes.set(id, { id, type: children.length ? "group" : "rectangle", childIds: children,
      frame: { x, y: 20, width: 100, height: 40 }, zIndex: 0, props: { rotation } });
  };
  put("a", 0); put("b", 200, [], 75); put("inner", 999, ["a", "b"]); put("outer", 999, ["inner"], 50);
  return { nodes, geometry: new ElementGeometry(id => nodes.get(id)) };
}

test("fits leaf corners in group axes without changing children or storing bounds", () => {
  const { nodes, geometry } = fixture();
  const before = structuredClone([...nodes]);
  for (const groupId of ["inner", "outer"]) {
    const f = geometry.frame(groupId)!;
    const center = { x: f.x + f.width / 2, y: f.y + f.height / 2 };
    const points = ["a", "b"].flatMap(id => {
      const leaf = nodes.get(id)!.frame;
      const pivot = { x: leaf.x + leaf.width / 2, y: leaf.y + leaf.height / 2 };
      return [leaf.x, leaf.x + leaf.width].flatMap(x => [leaf.y, leaf.y + leaf.height].map(y =>
        rotatePoint(rotatePoint({ x, y }, pivot, geometry.rotation(id)), center, -geometry.rotation(groupId))));
    });
    expect(Math.min(...points.map(p => p.x))).toBeCloseTo(f.x);
    expect(Math.max(...points.map(p => p.x))).toBeCloseTo(f.x + f.width);
    expect(Math.min(...points.map(p => p.y))).toBeCloseTo(f.y);
    expect(Math.max(...points.map(p => p.y))).toBeCloseTo(f.y + f.height);
  }
  expect([...nodes]).toEqual(before);
});

test("derives changed ancestors, preserves angle, and supports one child, empty and missing groups", () => {
  const { nodes, geometry } = fixture();
  const before = geometry.frame("outer")!;
  nodes.get("b")!.frame.x += 80;
  expect(geometry.frame("outer")!.width).toBeGreaterThan(before.width);
  expect(geometry.rotation("outer")).toBe(50);
  nodes.get("inner")!.childIds = ["a"];
  expect(geometry.frame("inner")!.width).toBeCloseTo(100);
  expect(geometry.frame("inner")!.height).toBeCloseTo(40);
  nodes.get("inner")!.childIds = [];
  expect(geometry.frame("inner")).toEqual(nodes.get("inner")!.frame);
  expect(geometry.frame("missing")).toBeUndefined();
});

test("reads only the requested group's descendants in a large document", () => {
  const { nodes } = fixture();
  for (let i = 0; i < 1000; i++) nodes.set(`unrelated-${i}`, { ...nodes.get("a")!, id: `unrelated-${i}` });
  const reads: string[] = [];
  const read = (id: string) => { reads.push(id); return nodes.get(id); };
  const geometry = new ElementGeometry(read);
  expect(geometry.frame("outer")!.width).toBeGreaterThan(100);
  expect(reads.every((id) => ["outer", "inner", "a", "b"].includes(id))).toBe(true);
  expect(reads.length).toBeLessThanOrEqual(4 * 4);
});

test("uses a connector's temporary target rotation without persisting it", () => {
  const frame = { x: 0, y: 0, width: 120, height: 1 };
  const group: EditorElementNode = { id: "group", type: "group", frame, zIndex: 0,
    childIds: ["line"], props: { rotation: 90 } };
  const line: EditorElementNode = { id: "line", type: "connector", frame, zIndex: 0,
    childIds: [], props: {} };
  const read = (id: string) => id === "group" ? group : line;
  const stored = new ElementGeometry(read);
  const preview = new ElementGeometry(read, (id) => id === "line" ? 90 : undefined);
  expect(preview.frame("group")!.width).toBeCloseTo(120);
  expect(preview.frame("group")!.height).toBeCloseTo(1);
  expect(stored.rotation("line")).toBe(0);
  expect(stored.frame("group")!.height).toBeCloseTo(120);
  expect(line.props).toEqual({});
});
