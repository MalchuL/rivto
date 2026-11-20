import { BrowserInputRoot } from "../browser-input-root";

it("reads selected values and viewport bounds in document order, including nested regions", () => {
  const element = document.createElement("div");
  element.innerHTML =
    '<div data-key="one"></div><div data-editor><div data-key="two"></div></div><div data-key="one"></div><div data-key="other"></div>';
  const matches = element.querySelectorAll<HTMLElement>("[data-key]");
  const measures = [...matches].map((match, index) =>
    jest.spyOn(match, "getBoundingClientRect").mockReturnValue({
      top: index * 10,
      bottom: index * 10 + 5,
      height: 5,
    } as DOMRect),
  );
  const root = new BrowserInputRoot(element);
  try {
    expect(root.readRegionValues("data-key", ["two", "one"])).toEqual(["one", "two"]);
    expect(root.measureRegionViewportBounds("data-key", ["two", "one"])?.regions).toEqual([
      { value: "one", top: 0, bottom: 5, height: 5 },
      { value: "two", top: 10, bottom: 15, height: 5 },
      { value: "one", top: 20, bottom: 25, height: 5 },
    ]);
    expect(measures[3]).not.toHaveBeenCalled();
  } finally {
    measures.forEach((measure) => measure.mockRestore());
    root.detach();
  }
});

it("discards a region bounds snapshot if its Root detaches during measurement", () => {
  const element = document.createElement("div");
  element.innerHTML = '<div data-key="one"></div><div data-key="two"></div>';
  const [first, second] = element.querySelectorAll<HTMLElement>("[data-key]");
  const root = new BrowserInputRoot(element);
  const firstMeasure = jest.spyOn(first, "getBoundingClientRect").mockImplementation(() => {
    root.detach();
    return { top: 0, bottom: 5, height: 5 } as DOMRect;
  });
  const secondMeasure = jest.spyOn(second, "getBoundingClientRect");
  try {
    expect(root.measureRegionViewportBounds("data-key", ["one", "two"])).toBeUndefined();
    expect(secondMeasure).not.toHaveBeenCalled();
    expect(root.readRegionValues("data-key", ["one"])).toEqual([]);
  } finally {
    firstMeasure.mockRestore();
    secondMeasure.mockRestore();
    root.detach();
  }
});

it("measures the first matching descendant and discards a result after detachment", () => {
  const element = document.createElement("div");
  element.innerHTML = '<div data-key="one"></div><div data-editor><div data-key="one"></div></div>';
  const first = element.querySelector<HTMLElement>('[data-key="one"]')!;
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const root = new BrowserInputRoot(element);
  const measure = jest
    .spyOn(first, "getBoundingClientRect")
    .mockReturnValue({ top: 42 } as DOMRect);
  try {
    expect(root.readRegionViewportTop("data-key", "one")).toBe(42);
    expect(root.readRegionViewportTop("data-key", "missing")).toBeUndefined();
    measure.mockImplementation(() => {
      root.detach();
      return { top: 10 } as DOMRect;
    });
    expect(root.readRegionViewportTop("data-key", "one")).toBeUndefined();
  } finally {
    measure.mockRestore();
    root.detach();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("does not measure a descendant when lookup detaches its Root", () => {
  const element = document.createElement("div");
  const child = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const measure = jest.spyOn(child, "getBoundingClientRect");
  const query = jest.spyOn(element, "querySelector").mockImplementation(() => {
    root.detach();
    return child;
  });
  try {
    expect(root.readRegionViewportTop("data-key", "one")).toBeUndefined();
    expect(measure).not.toHaveBeenCalled();
  } finally {
    query.mockRestore();
    measure.mockRestore();
    root.detach();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("finds owned regions and invalidates their reads and writes on detach", () => {
  const element = document.createElement("div");
  element.dataset.editor = "";
  element.innerHTML =
    '<div data-region="outer"></div><div data-editor><div data-region="inner"></div></div>';
  const outer = element.querySelector<HTMLElement>('[data-region="outer"]')!;
  const root = new BrowserInputRoot(element);
  const regions = root.findRegions("[data-region]", "[data-editor]");
  expect(regions).toHaveLength(1);
  expect(regions[0].readAttribute("data-region")).toBe("outer");
  const restore = regions[0].setTemporaryAttribute("data-feedback", "active");
  expect(outer.getAttribute("data-feedback")).toBe("active");
  root.detach();
  expect(root.findRegions("[data-region]", "[data-editor]")).toEqual([]);
  expect(regions[0].readAttribute("data-region")).toBeUndefined();
  regions[0].toggleAttribute("data-new", true);
  expect(outer.hasAttribute("data-new")).toBe(false);
  const replacement = new BrowserInputRoot(element);
  expect(regions[0].isSame(replacement.findRegions("[data-region]", "[data-editor]")[0])).toBe(
    false,
  );
  restore();
  expect(outer.hasAttribute("data-feedback")).toBe(false);
  replacement.detach();
});

it("scrolls only the first matching region outside nested occurrences", () => {
  const element = document.createElement("div");
  element.dataset.editor = "";
  element.innerHTML =
    '<div data-editor><div data-region="target"></div></div><div data-region="target"></div><div data-region="target"></div>';
  const [nested, first, second] = element.querySelectorAll<HTMLElement>("[data-region]");
  nested.scrollIntoView = jest.fn();
  first.scrollIntoView = jest.fn();
  second.scrollIntoView = jest.fn();
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const root = new BrowserInputRoot(element);
  try {
    root.scrollFirstMatchingRegionIntoView("data-region", "target", "[data-editor]");
    expect(nested.scrollIntoView).not.toHaveBeenCalled();
    expect(first.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(second.scrollIntoView).not.toHaveBeenCalled();
    root.detach();
    root.scrollFirstMatchingRegionIntoView("data-region", "target", "[data-editor]");
    expect(first.scrollIntoView).toHaveBeenCalledTimes(1);
  } finally {
    root.detach();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("does not scroll a region when its Root detaches during lookup", () => {
  const element = document.createElement("div");
  element.dataset.editor = "";
  element.innerHTML = '<div data-region="target"></div>';
  const region = element.firstElementChild as HTMLElement;
  region.scrollIntoView = jest.fn();
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const root = new BrowserInputRoot(element);
  const query = element.querySelectorAll.bind(element);
  const lookup = jest.spyOn(element, "querySelectorAll").mockImplementation((selector) => {
    const result = query(selector);
    root.detach();
    return result;
  });
  try {
    root.scrollFirstMatchingRegionIntoView("data-region", "target", "[data-editor]");
    expect(region.scrollIntoView).not.toHaveBeenCalled();
  } finally {
    lookup.mockRestore();
    root.detach();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
it("scrolls an unmarked surface's own match without entering a nested panel", () => {
  const panel = document.createElement("div");
  panel.dataset.panel = "";
  const surface = document.createElement("div");
  surface.innerHTML =
    '<div data-panel><div data-block="target"></div></div><div data-block="target"></div>';
  panel.append(surface);
  const nested = surface.querySelector<HTMLElement>("[data-panel] [data-block]")!;
  const own = surface.lastElementChild as HTMLElement;
  nested.scrollIntoView = jest.fn();
  own.scrollIntoView = jest.fn();
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const root = new BrowserInputRoot(surface);
  try {
    root.scrollFirstMatchingRegionIntoView("data-block", "target", "[data-panel]");
    expect(nested.scrollIntoView).not.toHaveBeenCalled();
    expect(own.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  } finally {
    root.detach();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("captures only the first owned region for each requested attribute value", () => {
  const element = document.createElement("div");
  element.dataset.panel = "";
  element.innerHTML =
    '<div data-panel><div data-block="a"></div></div><div data-block="a"></div><div data-block="a"></div><div data-block="b"></div>';
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const root = new BrowserInputRoot(element);
  try {
    const regions = root.findRegionsByAttribute(
      "data-block",
      ["b", "a", "missing"],
      "[data-panel]",
    );
    expect(regions.map((region) => region.readAttribute("data-block"))).toEqual(["a", "b"]);
  } finally {
    root.detach();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
