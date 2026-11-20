import { BrowserInputRoot } from "../browser-input-root";
import { inputElementIdentity } from "../input-element-identity";
import type { InputTarget } from "../../../events/types";

it("preserves capture and bubble order for nested region subscriptions", () => {
  const surface = document.createElement("div");
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  const button = document.createElement("button");
  inner.append(button);
  outer.append(inner);
  surface.append(outer);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const order: string[] = [];
  try {
    const outerRegion = root.captureRegionByIdentity(inputElementIdentity(outer))!;
    const innerRegion = root.captureRegionByIdentity(inputElementIdentity(inner))!;
    const releases = [
      outerRegion.observeInput("click", "capture", () => order.push("outer capture"))!,
      innerRegion.observeInput("click", "capture", () => order.push("inner capture"))!,
      innerRegion.observeInput("click", "bubble", (input) => {
        expect(input.type).toBe("click");
        expect(input.target?.belongsToRoot()).toBe(true);
        expect(input).not.toHaveProperty("nativeEvent");
        order.push("inner bubble");
      })!,
      outerRegion.observeInput("click", "bubble", () => order.push("outer bubble"))!,
    ];
    button.click();
    expect(order).toEqual(["outer capture", "inner capture", "inner bubble", "outer bubble"]);
    root.detach();
    button.click();
    expect(order).toHaveLength(4);
    for (const release of releases) {
      release();
      release();
    }
  } finally {
    root.detach();
    surface.remove();
  }
});

it("stops later region delivery after a listener detaches the occurrence", () => {
  const surface = document.createElement("div");
  const child = document.createElement("button");
  surface.append(child);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const outer = root.captureRegionByIdentity(inputElementIdentity(surface))!;
  const inner = root.captureRegionByIdentity(inputElementIdentity(child))!;
  const seen = jest.fn();
  const releaseOuter = outer.observeInput("click", "bubble", seen)!;
  const releaseInner = inner.observeInput("click", "bubble", () => root.detach())!;
  try {
    child.click();
    expect(seen).not.toHaveBeenCalled();
    expect(inner.observeInput("click", "bubble", seen)).toBeUndefined();
  } finally {
    releaseInner();
    releaseOuter();
    root.detach();
    surface.remove();
  }
});

it("limits target hit capture to delivery and supports explicit default cancellation", () => {
  const surface = document.createElement("div");
  const child = document.createElement("button");
  child.dataset.control = "";
  surface.append(child);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const region = root.captureRegionByIdentity(inputElementIdentity(child))!;
  let target: InputTarget | null | undefined;
  const release = region.observeInput("click", "bubble", (input) => {
    target = input.target;
    expect(target?.hasAncestor("[data-control]")).toBe(true);
    const hit = target?.captureTargetHit();
    expect(hit?.isCurrent()).toBe(true);
    hit?.release();
    input.preventDefault();
  })!;
  try {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(child.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(target?.captureTargetHit()).toBeUndefined();
  } finally {
    release();
    root.detach();
    surface.remove();
  }
});

it("removes a partially installed listener when browser setup fails", () => {
  const surface = document.createElement("div");
  const child = document.createElement("button");
  surface.append(child);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const region = root.captureRegionByIdentity(inputElementIdentity(child))!;
  const install = child.addEventListener.bind(child);
  const add = jest
    .spyOn(child, "addEventListener")
    .mockImplementation((type, listener, options) => {
      install(type, listener, options);
      throw new Error("listener setup failed");
    });
  const remove = jest.spyOn(child, "removeEventListener");
  const seen = jest.fn();
  try {
    expect(() => region.observeInput("click", "bubble", seen)).toThrow("listener setup failed");
    expect(remove).toHaveBeenCalledTimes(1);
    child.click();
    expect(seen).not.toHaveBeenCalled();
  } finally {
    add.mockRestore();
    remove.mockRestore();
    root.detach();
    surface.remove();
  }
});

it("retains both setup and rollback failures while disabling the listener", () => {
  const surface = document.createElement("div");
  const child = document.createElement("button");
  surface.append(child);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const region = root.captureRegionByIdentity(inputElementIdentity(child))!;
  const setupFailure = new Error("listener setup failed");
  const cleanupFailure = new Error("listener cleanup failed");
  const install = child.addEventListener.bind(child);
  const add = jest
    .spyOn(child, "addEventListener")
    .mockImplementation((type, listener, options) => {
      install(type, listener, options);
      throw setupFailure;
    });
  const remove = jest.spyOn(child, "removeEventListener").mockImplementation(() => {
    throw cleanupFailure;
  });
  const seen = jest.fn();
  try {
    let failure: unknown;
    try {
      region.observeInput("click", "bubble", seen);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([setupFailure, cleanupFailure]);
    child.click();
    expect(seen).not.toHaveBeenCalled();
  } finally {
    add.mockRestore();
    remove.mockRestore();
    root.detach();
    surface.remove();
  }
});
