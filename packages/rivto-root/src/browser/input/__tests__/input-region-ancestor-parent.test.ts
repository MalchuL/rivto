import { BrowserInputRoot } from "../browser-input-root";
import { inputElementIdentity } from "../input-element-identity";

it.each(["reparent", "disconnect", "match", "replace-root"] as const)(
  "invalidates a captured ancestor and parent when its path changes: %s",
  (change) => {
    const rootElement = document.createElement("div");
    const lane = document.createElement("div");
    const tile = document.createElement("div");
    const target = document.createElement("span");
    tile.className = "tile";
    tile.append(target);
    lane.append(tile);
    rootElement.append(lane);
    document.body.append(rootElement);
    const root = new BrowserInputRoot(rootElement);
    const region = root.captureRegionByIdentity(inputElementIdentity(target))!;
    const captured = region.captureAncestorWithParent(".tile")!;
    try {
      expect(captured.ancestor.getIdentity()).toBe(inputElementIdentity(tile));
      expect(captured.parent.getIdentity()).toBe(inputElementIdentity(lane));
      if (change === "reparent") {
        const wrapper = document.createElement("div");
        lane.append(wrapper);
        wrapper.append(tile);
      } else if (change === "disconnect") {
        rootElement.remove();
      } else if (change === "match") {
        tile.className = "";
      } else {
        root.detach();
      }
      expect(captured.ancestor.getIdentity()).toBeUndefined();
      expect(captured.parent.getIdentity()).toBeUndefined();
    } finally {
      root.detach();
      rootElement.remove();
    }
  },
);

it("rejects ancestors whose parent belongs outside the occurrence", () => {
  const lane = document.createElement("div");
  const tile = document.createElement("div");
  const handle = document.createElement("div");
  tile.className = "tile";
  tile.append(handle);
  lane.append(tile);
  document.body.append(lane);
  const root = new BrowserInputRoot(tile);
  try {
    const region = root.captureRegionByIdentity(inputElementIdentity(handle))!;
    expect(region.captureAncestorWithParent(".tile")).toBeUndefined();
  } finally {
    root.detach();
    lane.remove();
  }
});

it("rejects captured regions when an ownership callback reparents the ancestor", () => {
  const rootElement = document.createElement("div");
  const lane = document.createElement("div");
  const wrapper = document.createElement("div");
  const tile = document.createElement("div");
  const target = document.createElement("span");
  tile.className = "tile";
  tile.append(target);
  lane.append(tile, wrapper);
  rootElement.append(lane);
  document.body.append(rootElement);
  let checks = 0;
  let armed = false;
  const root = new BrowserInputRoot(rootElement, () => {
    if (armed && ++checks === 2) {
      wrapper.append(tile);
    }
    return true;
  });
  try {
    const region = root.captureRegionByIdentity(inputElementIdentity(target))!;
    const captured = region.captureAncestorWithParent(".tile")!;
    armed = true;
    expect(captured.ancestor.getIdentity()).toBeUndefined();
    expect(captured.parent.getIdentity()).toBeUndefined();
  } finally {
    root.detach();
    rootElement.remove();
  }
});
