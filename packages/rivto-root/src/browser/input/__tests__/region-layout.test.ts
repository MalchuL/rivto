import { BrowserInputRoot } from "../browser-input-root";
import { inputElementIdentity } from "../input-element-identity";

it("copies layout values and scale from an owned region", () => {
  const element = document.createElement("div");
  element.style.direction = "rtl";
  element.style.setProperty("--spacing", "24px");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  Object.defineProperties(element, {
    offsetWidth: { configurable: true, value: 50 },
    offsetHeight: { configurable: true, value: 25 },
    clientWidth: { configurable: true, value: 46 },
    clientHeight: { configurable: true, value: 21 },
  });
  jest.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 110,
    bottom: 70,
    width: 100,
    height: 50,
    toJSON: () => ({}),
  });
  try {
    const region = root.captureRegionByIdentity(inputElementIdentity(element))!;
    expect(region.readLayoutWidth()).toBe(50);
    expect(region.readComputedProperty("--spacing")).toBe("24px");
    expect(region.readClientSize()).toEqual({ width: 46, height: 21 });
    const layout = region.readLayout(["--spacing"]);
    expect(layout).toEqual({
      bounds: { left: 10, top: 20, width: 100, height: 50 },
      scaleX: 2,
      scaleY: 2,
      direction: "rtl",
      properties: { "--spacing": "24px" },
    });
    element.style.setProperty("--spacing", "40px");
    expect(layout?.properties["--spacing"]).toBe("24px");
    root.detach();
    expect(region.readLayoutWidth()).toBeUndefined();
    expect(region.readComputedProperty("--spacing")).toBeUndefined();
    expect(region.readClientSize()).toBeUndefined();
    expect(region.readLayout(["--spacing"])).toBeUndefined();
  } finally {
    root.detach();
    element.remove();
  }
});

it("discards layout when its Root detaches during measurement", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const region = root.captureRegionByIdentity(inputElementIdentity(element))!;
  jest.spyOn(element, "getBoundingClientRect").mockImplementation(() => {
    root.detach();
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 10,
      bottom: 10,
      width: 10,
      height: 10,
      toJSON: () => ({}),
    };
  });
  try {
    expect(region.readLayout([])).toBeUndefined();
  } finally {
    root.detach();
    element.remove();
  }
});

it("discards the layout width when its Root detaches during measurement", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const region = root.captureRegionByIdentity(inputElementIdentity(element))!;
  Object.defineProperty(element, "offsetWidth", {
    /**
     * Detaches the occurrence while the browser width is read.
     *
     * @returns A width that must not escape the detached occurrence.
     */
    get() {
      root.detach();
      return 50;
    },
  });
  try {
    expect(region.readLayoutWidth()).toBeUndefined();
  } finally {
    root.detach();
    element.remove();
  }
});

it("discards client size when its Root detaches during measurement", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const region = root.captureRegionByIdentity(inputElementIdentity(element))!;
  Object.defineProperty(element, "clientWidth", {
    /**
     * Detaches the occurrence while the browser width is read.
     *
     * @returns A width that must not escape the detached occurrence.
     */
    get() {
      root.detach();
      return 50;
    },
  });
  try {
    expect(region.readClientSize()).toBeUndefined();
  } finally {
    root.detach();
  }
});

it("discards computed properties when its Root detaches during the style read", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const region = root.captureRegionByIdentity(inputElementIdentity(element))!;
  const original = window.getComputedStyle.bind(window);
  const style = jest.spyOn(window, "getComputedStyle").mockImplementation((target) => {
    const result = original(target);
    root.detach();
    return result;
  });
  try {
    expect(region.readComputedProperty("line-height")).toBeUndefined();
  } finally {
    style.mockRestore();
    root.detach();
  }
});
