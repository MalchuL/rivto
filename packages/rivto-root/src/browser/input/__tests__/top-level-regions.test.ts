import { BrowserInputRoot } from "../browser-input-root";

it("visits only top-level regions in document order and stops at a match", () => {
  const element = document.createElement("div");
  element.dataset.panel = "";
  element.innerHTML = `
    <div data-block="first"><div data-block="child"></div></div>
    <div data-panel><div data-block="nested"></div></div>
    <div data-block="second"></div><div data-block="third"></div>`;
  const root = new BrowserInputRoot(element);
  const visited: string[] = [];
  try {
    const matched = root.someTopLevelRegion("[data-block]", "[data-panel]", (region) => {
      visited.push(region.readAttribute("data-block")!);
      return region.readAttribute("data-block") === "second";
    });
    expect(matched).toBe(true);
    expect(visited).toEqual(["first", "second"]);
  } finally {
    root.detach();
  }
});

it("discards a top-level match when its predicate changes ownership", () => {
  const element = document.createElement("div");
  element.dataset.panel = "";
  element.innerHTML = '<div data-block="first"></div>';
  const root = new BrowserInputRoot(element);
  try {
    const matched = root.someTopLevelRegion("[data-block]", "[data-panel]", () => {
      root.detach();
      return true;
    });
    expect(matched).toBeUndefined();
  } finally {
    root.detach();
  }
});

it("supports an unmarked Root inside an occurrence boundary", () => {
  const panel = document.createElement("div");
  const element = document.createElement("div");
  panel.dataset.panel = "";
  element.innerHTML =
    '<div data-block="first"></div><div data-panel><div data-block="nested"></div></div>';
  panel.append(element);
  const root = new BrowserInputRoot(element);
  const visited: string[] = [];
  try {
    expect(
      root.someTopLevelRegion("[data-block]", "[data-panel]", (region) => {
        visited.push(region.readAttribute("data-block")!);
        return false;
      }),
    ).toBe(false);
    expect(visited).toEqual(["first"]);
  } finally {
    root.detach();
  }
});

it("discards a match moved under another matching region during the visit", () => {
  const element = document.createElement("div");
  element.dataset.panel = "";
  const first = document.createElement("div");
  first.dataset.block = "first";
  element.append(first);
  const root = new BrowserInputRoot(element);
  try {
    const matched = root.someTopLevelRegion("[data-block]", "[data-panel]", () => {
      const parent = document.createElement("div");
      parent.dataset.block = "parent";
      element.append(parent);
      parent.append(first);
      return true;
    });
    expect(matched).toBeUndefined();
  } finally {
    root.detach();
  }
});
