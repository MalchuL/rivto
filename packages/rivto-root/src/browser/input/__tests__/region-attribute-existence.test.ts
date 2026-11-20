import { BrowserInputRoot } from "../browser-input-root";

it("finds exact attribute values only inside the owning occurrence", () => {
  const element = document.createElement("div");
  element.dataset.panel = "";
  const nested = document.createElement("div");
  nested.dataset.panel = "";
  const foreign = document.createElement("div");
  foreign.dataset.block = 'quoted"value';
  nested.append(foreign);
  element.append(nested);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value.replace(/["\\]/g, "\\$&") },
  });
  const root = new BrowserInputRoot(element);
  const query = jest.spyOn(element, "querySelectorAll");
  try {
    expect(root.hasRegionByAttribute("data-block", 'quoted"value', "[data-panel]")).toBe(false);
    const own = document.createElement("div");
    own.dataset.block = 'quoted"value';
    element.append(own);
    expect(root.hasRegionByAttribute("data-block", 'quoted"value', "[data-panel]")).toBe(true);
    expect(query).toHaveBeenCalledWith('[data-block="quoted\\"value"]');
    root.detach();
    expect(root.hasRegionByAttribute("data-block", 'quoted"value', "[data-panel]")).toBe(false);
  } finally {
    query.mockRestore();
    root.detach();
    if (previous) {
      Object.defineProperty(globalThis, "CSS", previous);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("discards a match when the region moves into a nested occurrence during the lookup", () => {
  const element = document.createElement("div");
  element.dataset.panel = "";
  const nested = document.createElement("div");
  nested.dataset.panel = "";
  const target = document.createElement("div");
  target.dataset.block = "one";
  element.append(target, nested);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape: String } });
  const root = new BrowserInputRoot(element);
  const closest = target.closest.bind(target);
  const read = jest.spyOn(target, "closest").mockImplementation((selector) => {
    const match = closest(selector);
    nested.append(target);
    return match;
  });
  try {
    expect(root.hasRegionByAttribute("data-block", "one", "[data-panel]")).toBe(false);
  } finally {
    read.mockRestore();
    root.detach();
    if (previous) {
      Object.defineProperty(globalThis, "CSS", previous);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
