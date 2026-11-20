import { BrowserInputRoot } from "../../input/browser-input-root";

it("creates, updates, measures, and removes a document path after detachment", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const overlay = root.createPathOverlay({
    className: "test-path",
    attributes: { "data-test-path": "true" },
  });
  try {
    expect(overlay.create()).toBe(true);
    const svg = document.querySelector<SVGSVGElement>("svg[data-test-path]")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.parentElement).toBe(document.body);
    expect(overlay.readBounds()).toBeDefined();
    expect(overlay.update("M 1 2 L 3 4")).toBe(true);
    expect(svg.querySelector("path")?.getAttribute("d")).toBe("M 1 2 L 3 4");
    root.detach();
    expect(overlay.readBounds()).toBeUndefined();
    expect(overlay.update("M 5 6")).toBe(false);
    overlay.remove();
    overlay.remove();
    expect(svg.isConnected).toBe(false);
  } finally {
    overlay.remove();
    root.detach();
    element.remove();
  }
});

it("does not retain an overlay removed during body attachment", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const overlay = root.createPathOverlay({
    className: "test-path",
    attributes: { "data-test-path": "true" },
  });
  const append = document.body.append.bind(document.body);
  const spy = jest.spyOn(document.body, "append").mockImplementation((...nodes) => {
    overlay.remove();
    append(...nodes);
  });
  try {
    expect(overlay.create()).toBe(false);
    expect(document.querySelector("svg[data-test-path]")).toBeNull();
  } finally {
    spy.mockRestore();
    overlay.remove();
    root.detach();
    element.remove();
  }
});

it("does not affect a replacement occurrence on the same element", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const firstRoot = new BrowserInputRoot(element);
  const first = firstRoot.createPathOverlay({ className: "old-path", attributes: {} });
  expect(first.create()).toBe(true);
  firstRoot.detach();
  const secondRoot = new BrowserInputRoot(element);
  const second = secondRoot.createPathOverlay({ className: "new-path", attributes: {} });
  try {
    expect(second.create()).toBe(true);
    expect(second.update("M 1 2")).toBe(true);
    expect(first.update("M 9 9")).toBe(false);
    first.remove();
    expect(document.querySelector("svg.new-path path")?.getAttribute("d")).toBe("M 1 2");
  } finally {
    first.remove();
    second.remove();
    secondRoot.detach();
    element.remove();
  }
});
