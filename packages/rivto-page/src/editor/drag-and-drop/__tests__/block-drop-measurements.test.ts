import { captureTestInputHit } from "../../../test-utils/capture-test-input-hit";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockDropMeasurements, DROP_MEASUREMENT_UNAVAILABLE } from "../block-drop-measurements";
import { BlockLayoutRegions } from "../../../presentation/components/block-layout/block-layout-regions";

it("does not borrow a registered child scope from another editor", () => {
  const rootElement = document.createElement("div");
  const anchor = document.createElement("div");
  const child = document.createElement("div");
  child.setAttribute("data-block-drop-scope", "local");
  anchor.append(child);
  rootElement.append(anchor);
  document.body.append(rootElement);
  const ownRegions = new BlockLayoutRegions();
  const foreignRegions = new BlockLayoutRegions();
  foreignRegions.register("a", "shell", getBrowserElementIdentity(anchor));
  foreignRegions.register("a", "children", getBrowserElementIdentity(child));
  const root = new BrowserInputRoot(rootElement);
  const hit = captureTestInputHit(anchor);
  const measurements = new BlockDropMeasurements(root, () => root.isAttached(), hit, ownRegions);
  try {
    expect(measurements.continuesOutline(getBrowserElementIdentity(anchor))).toBe(true);
  } finally {
    hit.release();
    root.detach();
    ownRegions.destroy();
    foreignRegions.destroy();
    rootElement.remove();
  }
});

it("reads virtual metadata from the nearest indexed ancestor and rejects a moved path", () => {
  const rootElement = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  const anchor = document.createElement("div");
  first.dataset.index = "4";
  first.setAttribute("data-virtual-last", "");
  second.dataset.index = "9";
  first.append(anchor);
  rootElement.append(first, second);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  const hit = captureTestInputHit(anchor);
  const measurements = new BlockDropMeasurements(
    root,
    () => root.isAttached(),
    hit,
    new BlockLayoutRegions(),
  );
  try {
    expect(
      measurements.readAncestorAttribute(
        getBrowserElementIdentity(anchor),
        "[data-index]",
        "data-index",
      ),
    ).toBe("4");
    expect(
      measurements.readAncestorAttribute(
        getBrowserElementIdentity(anchor),
        "[data-index]",
        "data-virtual-last",
      ),
    ).toBe("");
    expect(
      measurements.contains(getBrowserElementIdentity(first), getBrowserElementIdentity(anchor)),
    ).toBe(true);
    expect(
      measurements.contains(getBrowserElementIdentity(second), getBrowserElementIdentity(anchor)),
    ).toBe(false);
    const matches = anchor.matches.bind(anchor);
    jest.spyOn(anchor, "matches").mockImplementation((selector) => {
      second.append(anchor);
      return matches(selector);
    });
    let failure: unknown;
    try {
      measurements.readAncestorAttribute(
        getBrowserElementIdentity(anchor),
        "[data-index]",
        "data-index",
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(DROP_MEASUREMENT_UNAVAILABLE);
  } finally {
    hit.release();
    root.detach();
    rootElement.remove();
  }
});

it("ignores registered identities outside the current occurrence", () => {
  const rootElement = document.createElement("div");
  const host = document.createElement("div");
  const child = document.createElement("div");
  const foreign = document.createElement("div");
  host.append(child);
  rootElement.append(host);
  document.body.append(rootElement, foreign);
  const root = new BrowserInputRoot(rootElement);
  const hit = captureTestInputHit(host);
  const measurements = new BlockDropMeasurements(
    root,
    () => root.isAttached(),
    hit,
    new BlockLayoutRegions(),
  );
  const region = root.captureRegionByIdentity(getBrowserElementIdentity(host))!;
  try {
    expect(measurements.containsIdentity(region, getBrowserElementIdentity(foreign))).toBe(false);
    expect(measurements.containsIdentity(region, getBrowserElementIdentity(child))).toBe(true);
    child.remove();
    expect(measurements.containsIdentity(region, getBrowserElementIdentity(child))).toBe(false);
  } finally {
    hit.release();
    root.detach();
    rootElement.remove();
    foreign.remove();
  }
});

it("reads registered outline scope through Root and rejects a detached attachment", () => {
  const rootElement = document.createElement("div");
  const anchor = document.createElement("div");
  const child = document.createElement("div");
  anchor.append(child);
  rootElement.append(anchor);
  document.body.append(rootElement);
  const regions = new BlockLayoutRegions();
  regions.register("a", "shell", getBrowserElementIdentity(anchor));
  regions.register("a", "children", getBrowserElementIdentity(child));
  const root = new BrowserInputRoot(rootElement);
  const hit = captureTestInputHit(anchor);
  const measurements = new BlockDropMeasurements(root, () => root.isAttached(), hit, regions);
  try {
    child.setAttribute("data-block-drop-scope", "local");
    expect(measurements.continuesOutline(getBrowserElementIdentity(anchor))).toBe(false);
    child.setAttribute("data-block-drop-scope", "outline");
    expect(measurements.continuesOutline(getBrowserElementIdentity(anchor))).toBe(true);
    const read = child.getAttribute.bind(child);
    jest.spyOn(child, "getAttribute").mockImplementation((name) => {
      const value = read(name);
      root.detach();
      return value;
    });
    let failure: unknown;
    try {
      measurements.continuesOutline(getBrowserElementIdentity(anchor));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(DROP_MEASUREMENT_UNAVAILABLE);
  } finally {
    hit.release();
    root.detach();
    regions.destroy();
    rootElement.remove();
  }
});

it("reads background bounds through Root and stops when the region detaches", () => {
  const rootElement = document.createElement("div");
  const region = document.createElement("span");
  rootElement.append(region);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  const capture = jest.spyOn(root, "captureRegionByIdentity");
  const bounds = {
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 40,
    bottom: 60,
    width: 30,
    height: 40,
    toJSON: () => ({}),
  };
  const measure = jest.spyOn(region, "getBoundingClientRect").mockReturnValue(bounds);
  const hit = captureTestInputHit(region);
  const measurements = new BlockDropMeasurements(
    root,
    () => root.isAttached(),
    hit,
    new BlockLayoutRegions(),
  );
  try {
    expect(measurements.readBounds(getBrowserElementIdentity(region))).toEqual({
      left: 10,
      top: 20,
      right: 40,
      bottom: 60,
      width: 30,
      height: 40,
    });
    expect(capture).toHaveBeenCalledWith(getBrowserElementIdentity(region), expect.any(Function));
    measure.mockImplementation(() => {
      root.detach();
      return bounds;
    });
    let failure: unknown;
    try {
      measurements.readBounds(getBrowserElementIdentity(region));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(DROP_MEASUREMENT_UNAVAILABLE);
  } finally {
    hit.release();
    root.detach();
    rootElement.remove();
  }
});

it("discards a background result when the hit moves during an ancestor measurement", () => {
  const rootElement = document.createElement("div");
  const host = document.createElement("div");
  const target = document.createElement("div");
  target.setAttribute("data-block-id", "child");
  rootElement.append(host);
  host.append(target);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  const hit = captureTestInputHit(target);
  const measurements = new BlockDropMeasurements(
    root,
    () => root.isAttached(),
    hit,
    new BlockLayoutRegions(),
  );
  jest.spyOn(target, "getBoundingClientRect").mockImplementation(() => {
    rootElement.append(target);
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    };
  });
  try {
    let failure: unknown;
    try {
      measurements.isBackground(getBrowserElementIdentity(host), { x: 50, y: 50 });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(DROP_MEASUREMENT_UNAVAILABLE);
  } finally {
    hit.release();
    root.detach();
    rootElement.remove();
  }
});

it("stops registered ancestor lookup when the starting region moves", () => {
  const rootElement = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  const target = document.createElement("span");
  rootElement.append(first, second);
  first.append(target);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  const hit = captureTestInputHit(target);
  const measurements = new BlockDropMeasurements(
    root,
    () => root.isAttached(),
    hit,
    new BlockLayoutRegions(),
  );
  try {
    let failure: unknown;
    try {
      measurements.walkAncestors(getBrowserElementIdentity(target), () => {
        second.append(target);
        return true;
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(DROP_MEASUREMENT_UNAVAILABLE);
  } finally {
    hit.release();
    root.detach();
    rootElement.remove();
  }
});
