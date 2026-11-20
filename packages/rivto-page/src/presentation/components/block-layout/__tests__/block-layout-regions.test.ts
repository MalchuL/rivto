import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockLayoutRegions } from "../block-layout-regions";

it("resolves wrapped owner regions without borrowing descendant rows", () => {
  const regions = new BlockLayoutRegions();
  const shell = document.createElement("div");
  shell.innerHTML =
    '<section><header><div class="rivto-block-row"></div></header><main><div class="rivto-block-children"><div data-block-id="child"><div class="rivto-block-row"></div></div></div></main></section>';
  const row = shell.querySelector<HTMLElement>(".rivto-block-row")!;
  const children = shell.querySelector<HTMLElement>(".rivto-block-children")!;
  document.body.append(shell);
  const root = new BrowserInputRoot(shell);
  const owner = root.captureRegionByIdentity(getBrowserElementIdentity(shell))!;
  const releases = [
    regions.register("parent", "shell", getBrowserElementIdentity(shell)),
    regions.register("parent", "row", getBrowserElementIdentity(row)),
    regions.register("parent", "children", getBrowserElementIdentity(children)),
  ];
  expect(regions.getRegionIdentity(owner, "row", root).identity).toBe(
    getBrowserElementIdentity(row),
  );
  expect(regions.getRegionIdentity(owner, "children", root).identity).toBe(
    getBrowserElementIdentity(children),
  );
  expect(regions.getRegionIdentity(owner, "body", root).identity).toBeUndefined();
  releases[1]!();
  expect(regions.getRegionIdentity(owner, "row", root).identity).toBeUndefined();
  releases.forEach((release) => release());
  expect(regions.getIdentities("parent", "children")).toEqual([]);
  row.remove();
  expect(
    owner.findOwnedRegion(".rivto-block-row", "[data-block-id], [data-rivto-block-editor]"),
  ).toBeUndefined();
  root.detach();
  shell.remove();
});

it("isolates occurrences and ignores obsolete disposers after replacement", () => {
  const first = new BlockLayoutRegions();
  const second = new BlockLayoutRegions();
  const row = document.createElement("div");
  const other = document.createElement("div");
  const old = first.register("same", "row", getBrowserElementIdentity(row));
  const current = first.register("same", "row", getBrowserElementIdentity(row));
  second.register("same", "row", getBrowserElementIdentity(other));
  old();
  expect(first.getIdentities("same", "row")).toEqual([getBrowserElementIdentity(row)]);
  expect(second.getIdentities("same", "row")).toEqual([getBrowserElementIdentity(other)]);
  current();
  expect(first.getIdentities("same", "row")).toEqual([]);
  second.destroy();
  expect(second.getIdentities("same", "row")).toEqual([]);
});

it("reads only the current registered content and never searches an unregistered subtree", () => {
  const regions = new BlockLayoutRegions();
  const element = document.createElement("div");
  const shell = document.createElement("div");
  const content = document.createElement("div");
  content.className = "rivto-block-content";
  shell.append(content);
  element.append(shell);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const rootRegion = root.captureRegionByIdentity(getBrowserElementIdentity(element))!;
  const owner = root.captureRegionByIdentity(getBrowserElementIdentity(shell))!;
  const stopShell = regions.register("parent", "shell", getBrowserElementIdentity(shell));
  const stopContent = regions.register("parent", "content", getBrowserElementIdentity(content));
  const children = jest.spyOn(element, "children", "get");
  expect(regions.getRegionIdentity(rootRegion, "content", root)).toEqual({ registered: false });
  expect(children).not.toHaveBeenCalled();
  expect(regions.getRegionIdentity(owner, "content", root).identity).toBe(
    getBrowserElementIdentity(content),
  );
  const replacement = document.createElement("div");
  content.replaceWith(replacement);
  const stopReplacement = regions.register(
    "parent",
    "content",
    getBrowserElementIdentity(replacement),
  );
  stopContent();
  expect(regions.getRegionIdentity(owner, "content", root).identity).toBe(
    getBrowserElementIdentity(replacement),
  );
  stopReplacement();
  expect(regions.getRegionIdentity(owner, "content", root).identity).toBeUndefined();
  stopShell();
  regions.destroy();
  root.detach();
  element.remove();
});
