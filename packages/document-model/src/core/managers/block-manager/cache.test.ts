import { BlockCache } from "./cache";

it("indexes additional roots and their descendants alongside page roots", () => {
  const children = new Map<string | null, string[]>([
    [null, ["page"]],
    ["page", []],
    ["side", ["child"]],
    ["child", []],
  ]);
  const extraRoots = ["side"];
  const cache = new BlockCache(
    (id) => (id === null ? [...children.get(null)!, ...extraRoots] : children.get(id)),
    (id) => children.has(id),
  );

  cache.refreshParents();
  expect(cache.getParentId("page")).toBeNull();
  expect(cache.getParentId("side")).toBeNull();
  expect(cache.getParentId("child")).toBe("side");

  extraRoots.length = 0;
  children.get(null)!.push("side");
  cache.refreshParents(new Set([null]));
  expect(cache.getParentId("child")).toBe("side");
  expect(cache.getIndexedChildren(null)).toEqual(["page", "side"]);
});
