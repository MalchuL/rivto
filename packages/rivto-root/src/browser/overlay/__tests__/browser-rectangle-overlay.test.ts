/** @jest-environment jsdom */
import { BrowserInputRoot } from "../../input/browser-input-root";

it("shows and hides a document rectangle and removes it after detachment", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const occurrence = new BrowserInputRoot(root);
  const overlay = occurrence.createRectangleOverlay({
    className: "test-rectangle",
    attributes: { "data-test-rectangle": "" },
  });
  try {
    expect(overlay.update({ x: 5, y: 7, width: 20, height: 30 })).toBe(true);
    const node = document.body.querySelector<HTMLElement>("[data-test-rectangle]")!;
    expect(node.parentElement).toBe(document.body);
    expect(node.className).toBe("test-rectangle");
    expect([node.style.left, node.style.top, node.style.width, node.style.height]).toEqual([
      "5px",
      "7px",
      "20px",
      "30px",
    ]);
    expect(overlay.update()).toBe(true);
    expect(node.style.display).toBe("none");
    occurrence.detach();
    expect(overlay.update({ x: 9, y: 9, width: 1, height: 1 })).toBe(false);
    expect(node.style.left).toBe("5px");
    overlay.remove();
    expect(node.isConnected).toBe(false);
  } finally {
    overlay.remove();
    occurrence.detach();
    root.remove();
  }
});

it("removes a rectangle appended after reentrant cancellation", () => {
  const root = document.createElement("div");
  const overlay = new BrowserInputRoot(root).createRectangleOverlay({
    className: "test-rectangle",
    attributes: {},
  });
  const append = document.body.append.bind(document.body);
  const spy = jest.spyOn(document.body, "append").mockImplementation((...nodes) => {
    overlay.remove();
    append(...nodes);
  });
  try {
    expect(overlay.update({ x: 1, y: 2, width: 3, height: 4 })).toBe(false);
    expect(document.body.querySelector(".test-rectangle")).toBeNull();
  } finally {
    spy.mockRestore();
    overlay.remove();
  }
});

it("rejects writes after the occurrence moves to another document", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const occurrence = new BrowserInputRoot(root);
  const overlay = occurrence.createRectangleOverlay({
    className: "test-rectangle",
    attributes: {},
  });
  try {
    expect(overlay.update({ x: 1, y: 2, width: 3, height: 4 })).toBe(true);
    const node = document.body.querySelector<HTMLElement>(".test-rectangle")!;
    const other = document.implementation.createHTMLDocument("other");
    other.body.append(root);
    expect(overlay.update({ x: 10, y: 20, width: 30, height: 40 })).toBe(false);
    expect(node.style.left).toBe("1px");
  } finally {
    overlay.remove();
    occurrence.detach();
    root.remove();
  }
});

it("creates a root-local rectangle with the supplied presentation and removes it after detachment", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const rectangle = root.createRectangleOverlay({
    className: "local-rectangle",
    attributes: { "data-local-rectangle": "" },
    container: "root",
    properties: { position: "absolute", "pointer-events": "none" },
  });
  try {
    expect(rectangle.update({ x: 2, y: 3, width: 20, height: 30 })).toBe(true);
    const node = element.querySelector<HTMLElement>("[data-local-rectangle]")!;
    expect(node.parentElement).toBe(element);
    expect(node.style.position).toBe("absolute");
    expect(node.style.pointerEvents).toBe("none");
    expect(node.style.left).toBe("2px");
    root.detach();
    expect(rectangle.update({ x: 9, y: 9, width: 1, height: 1 })).toBe(false);
    rectangle.remove();
    expect(node.isConnected).toBe(false);
  } finally {
    rectangle.remove();
    root.detach();
    element.remove();
  }
});

it("removes a root-local rectangle after reentrant cancellation during attachment", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const rectangle = root.createRectangleOverlay({
    className: "local-rectangle",
    attributes: {},
    container: "root",
  });
  const append = element.append.bind(element);
  const spy = jest.spyOn(element, "append").mockImplementation((...nodes) => {
    rectangle.remove();
    append(...nodes);
  });
  try {
    expect(rectangle.update({ x: 1, y: 2, width: 3, height: 4 })).toBe(false);
    expect(element.querySelector(".local-rectangle")).toBeNull();
  } finally {
    spy.mockRestore();
    rectangle.remove();
    root.detach();
  }
});
