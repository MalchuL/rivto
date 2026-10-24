import { BlockLayoutRegions, blockLayoutRegion } from "./block-layout-regions";

it("resolves wrapped owner regions without borrowing descendant rows", () => {
  const regions = new BlockLayoutRegions();
  const shell = document.createElement("div");
  shell.innerHTML =
    '<section><header><div class="rivto-block-row"></div></header><main><div class="rivto-block-children"><div data-block-id="child"><div class="rivto-block-row"></div></div></div></main></section>';
  const row = shell.querySelector<HTMLElement>(".rivto-block-row")!;
  const children = shell.querySelector<HTMLElement>(".rivto-block-children")!;
  const releases = [
    regions.register("parent", "shell", shell),
    regions.register("parent", "row", row),
    regions.register("parent", "children", children),
  ];
  expect(blockLayoutRegion(shell, "row")).toBe(row);
  expect(blockLayoutRegion(shell, "children")).toBe(children);
  expect(blockLayoutRegion(shell, "body")).toBeUndefined();
  releases[1]!();
  expect(blockLayoutRegion(shell, "row")).toBeUndefined();
  releases.forEach((release) => release());
  expect(regions.get("parent", "children")).toBeUndefined();
  // Standalone DOM follows the same ownership boundary through neutral wrappers.
  row.remove();
  expect(blockLayoutRegion(shell, "row")).toBeUndefined();
});

it("isolates occurrences and ignores obsolete disposers after replacement", () => {
  const first = new BlockLayoutRegions();
  const second = new BlockLayoutRegions();
  const row = document.createElement("div");
  const other = document.createElement("div");
  const old = first.register("same", "row", row);
  const current = first.register("same", "row", row);
  second.register("same", "row", other);
  old();
  expect(first.get("same", "row")).toBe(row);
  expect(second.get("same", "row")).toBe(other);
  current();
  expect(first.get("same", "row")).toBeUndefined();
  second.destroy();
  expect(second.get("same", "row")).toBeUndefined();
});
