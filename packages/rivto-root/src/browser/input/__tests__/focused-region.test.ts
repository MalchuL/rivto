import { BrowserInputRoot } from "../browser-input-root";

it("captures a focused owner and invalidates it when focus changes", () => {
  const rootElement = document.createElement("div");
  const block = document.createElement("div");
  const first = document.createElement("button");
  const second = document.createElement("button");
  rootElement.dataset.panel = "";
  block.dataset.block = "one";
  block.append(first, second);
  rootElement.append(block);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  try {
    first.focus();
    const region = root.captureFocusedRegion("[data-block]", "[data-panel]");
    expect(region?.readAttribute("data-block")).toBe("one");
    second.focus();
    expect(region?.readAttribute("data-block")).toBeUndefined();
    expect(root.captureFocusedRegion("[data-block]", "[data-panel]")).toBeDefined();
  } finally {
    root.detach();
    rootElement.remove();
  }
});

it("does not capture focus inside a nested occurrence", () => {
  const rootElement = document.createElement("div");
  const block = document.createElement("div");
  const nested = document.createElement("div");
  const input = document.createElement("input");
  rootElement.dataset.panel = "";
  block.dataset.block = "outer";
  nested.dataset.panel = "";
  nested.append(input);
  block.append(nested);
  rootElement.append(block);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  try {
    input.focus();
    expect(root.captureFocusedRegion("[data-block]", "[data-panel]")).toBeUndefined();
  } finally {
    root.detach();
    rootElement.remove();
  }
});

it("discards a focused region when focus changes during owner lookup", () => {
  const rootElement = document.createElement("div");
  const block = document.createElement("div");
  const first = document.createElement("button");
  const second = document.createElement("button");
  rootElement.dataset.panel = "";
  block.dataset.block = "one";
  block.append(first, second);
  rootElement.append(block);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  const closest = first.closest.bind(first);
  const spy = jest.spyOn(first, "closest").mockImplementation((selector) => {
    const match = closest(selector);
    if (selector === "[data-block]") {
      second.focus();
    }
    return match;
  });
  try {
    first.focus();
    expect(root.captureFocusedRegion("[data-block]", "[data-panel]")).toBeUndefined();
  } finally {
    spy.mockRestore();
    root.detach();
    rootElement.remove();
  }
});

it("captures nested focus when no occurrence boundary is requested", () => {
  const rootElement = document.createElement("div");
  const block = document.createElement("div");
  const nested = document.createElement("div");
  const input = document.createElement("input");
  block.dataset.block = "outer";
  nested.dataset.panel = "";
  nested.append(input);
  block.append(nested);
  rootElement.append(block);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  try {
    input.focus();
    const region = root.captureFocusedRegion("[data-block]");
    expect(region?.readAttribute("data-block")).toBe("outer");
    input.blur();
    expect(region?.readAttribute("data-block")).toBeUndefined();
  } finally {
    root.detach();
    rootElement.remove();
  }
});
