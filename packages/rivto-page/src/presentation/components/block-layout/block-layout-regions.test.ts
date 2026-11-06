import {
  BlockLayoutRegions,
  blockLayoutRegion,
  registeredBlockRegion,
} from "./block-layout-regions";

it("notifies only the addressed shell observer and ignores stale releases", () => {
  const regions = new BlockLayoutRegions();
  const first = document.createElement("div");
  const second = document.createElement("div");
  const seen: Array<HTMLElement | undefined> = [];
  const other = jest.fn();
  const stop = regions.subscribeShell("block", () => seen.push(regions.get("block", "shell")));
  regions.subscribeShell("other", other);
  const old = regions.register("block", "shell", first);
  const replacement = regions.register("block", "shell", first);
  old();
  replacement();
  const current = regions.register("block", "shell", second);
  expect(seen).toEqual([first, first, undefined, second]);
  expect(other).not.toHaveBeenCalled();
  stop();
  current();
  expect(seen).toHaveLength(4);
  regions.destroy();
});

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

it("reads only the current registered body and never searches an unregistered subtree", () => {
  const regions = new BlockLayoutRegions();
  const root = document.createElement("div");
  const shell = document.createElement("div");
  const content = document.createElement("div");
  content.className = "rivto-block-content";
  shell.append(content);
  root.append(shell);
  const stopShell = regions.register("parent", "shell", shell);
  const stopContent = regions.register("parent", "content", content);
  const children = jest.spyOn(root, "children", "get");
  expect(registeredBlockRegion(root, "content")).toBeUndefined();
  expect(children).not.toHaveBeenCalled();
  expect(registeredBlockRegion(shell, "content")).toBe(content);
  const replacement = document.createElement("div");
  content.replaceWith(replacement);
  const stopReplacement = regions.register("parent", "content", replacement);
  stopContent();
  expect(registeredBlockRegion(shell, "content")).toBe(replacement);
  stopReplacement();
  expect(registeredBlockRegion(shell, "content")).toBeUndefined();
  stopShell();
  regions.destroy();
});
