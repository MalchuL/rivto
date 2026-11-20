import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockLayoutRegions } from "../block-layout-regions";

it("resolves only current registered roles within the captured owner", () => {
  const regions = new BlockLayoutRegions();
  const otherRegions = new BlockLayoutRegions();
  const shell = document.createElement("div");
  const row = document.createElement("div");
  const replacement = document.createElement("div");
  shell.append(row, replacement);
  document.body.append(shell);
  const root = new BrowserInputRoot(shell);
  const owner = root.captureRegionByIdentity(getBrowserElementIdentity(shell))!;
  const stopShell = regions.register("block", "shell", getBrowserElementIdentity(shell));
  const stopOld = regions.register("block", "row", getBrowserElementIdentity(row));
  expect(regions.getRegionIdentity(owner, "row", root)).toEqual({
    registered: true,
    identity: getBrowserElementIdentity(row),
  });
  expect(otherRegions.getRegionIdentity(owner, "row", root)).toEqual({ registered: false });
  const stopNew = regions.register("block", "row", getBrowserElementIdentity(replacement));
  stopOld();
  expect(regions.getRegionIdentity(owner, "row", root).identity).toBe(
    getBrowserElementIdentity(replacement),
  );
  stopNew();
  expect(regions.getRegionIdentity(owner, "row", root)).toEqual({
    registered: true,
    identity: undefined,
  });
  stopShell();
  expect(regions.getRegionIdentity(owner, "row", root)).toEqual({ registered: false });
  regions.destroy();
  otherRegions.destroy();
  root.detach();
  shell.remove();
});

it("keeps registrations independent when occurrences temporarily share an element", () => {
  const first = new BlockLayoutRegions();
  const second = new BlockLayoutRegions();
  const shell = document.createElement("div");
  const firstRow = document.createElement("div");
  const secondRow = document.createElement("div");
  shell.append(firstRow, secondRow);
  document.body.append(shell);
  const root = new BrowserInputRoot(shell);
  const owner = root.captureRegionByIdentity(getBrowserElementIdentity(shell))!;
  const stopFirst = first.register("a", "shell", getBrowserElementIdentity(shell));
  first.register("a", "row", getBrowserElementIdentity(firstRow));
  const stopSecond = second.register("a", "shell", getBrowserElementIdentity(shell));
  second.register("a", "row", getBrowserElementIdentity(secondRow));
  expect(first.getRegionIdentity(owner, "row", root).identity).toBe(
    getBrowserElementIdentity(firstRow),
  );
  expect(second.getRegionIdentity(owner, "row", root).identity).toBe(
    getBrowserElementIdentity(secondRow),
  );
  stopFirst();
  expect(first.getRegionIdentity(owner, "row", root).registered).toBe(false);
  expect(second.getRegionIdentity(owner, "row", root).identity).toBe(
    getBrowserElementIdentity(secondRow),
  );
  stopSecond();
  first.destroy();
  second.destroy();
  root.detach();
  shell.remove();
});
