import { BrowserInputRoot } from "../../input/browser-input-root";

it("positions, switches and hides a line without exposing its node", () => {
  const root = document.createElement("div");
  const overlay = new BrowserInputRoot(root).createLineOverlay({
    className: "line",
    thickness: "4px",
  });
  try {
    expect(overlay.update({ x: 10, y: 20, length: 80, orientation: "horizontal" })).toBe(true);
    const line = root.querySelector<HTMLElement>(".line")!;
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(line.dataset.axis).toBe("horizontal");
    expect(line.style.transform).toBe("translate(10px, 20px)");
    expect(line.style.width).toBe("80px");
    expect(line.style.height).toBe("4px");
    overlay.update({ x: 5, y: 6, length: 30, orientation: "vertical" });
    expect(line.dataset.axis).toBe("vertical");
    expect(line.style.width).toBe("4px");
    expect(line.style.height).toBe("30px");
    expect(overlay.update()).toBe(true);
    expect(line.hidden).toBe(true);
  } finally {
    overlay.remove();
  }
});

it("removes a line appended after reentrant cancellation", () => {
  const root = document.createElement("div");
  const overlay = new BrowserInputRoot(root).createLineOverlay({
    className: "line",
    thickness: "4px",
  });
  const append = root.append.bind(root);
  const spy = jest.spyOn(root, "append").mockImplementation((...nodes) => {
    overlay.remove();
    append(...nodes);
  });
  try {
    overlay.update({ x: 1, y: 2, length: 10, orientation: "horizontal" });
    expect(root.querySelector(".line")).toBeNull();
  } finally {
    spy.mockRestore();
    overlay.remove();
  }
});

it("does not create a line after removal during the initial ownership check", () => {
  const root = document.createElement("div");
  let checks = 0;
  const occurrence = new BrowserInputRoot(root, () => {
    if (++checks === 1) {
      overlay.remove();
    }
    return true;
  });
  const overlay = occurrence.createLineOverlay({ className: "line", thickness: "4px" });
  overlay.update({ x: 1, y: 2, length: 10, orientation: "horizontal" });
  expect(root.querySelector(".line")).toBeNull();
});

it("retains partial setup for cleanup when attaching the line fails", () => {
  const root = document.createElement("div");
  const overlay = new BrowserInputRoot(root).createLineOverlay({
    className: "line",
    thickness: "4px",
  });
  const spy = jest.spyOn(root, "append").mockImplementation(() => {
    throw new Error("attachment failed");
  });
  try {
    expect(() => overlay.update({ x: 1, y: 2, length: 10, orientation: "horizontal" })).toThrow(
      "attachment failed",
    );
    expect(() => overlay.remove()).not.toThrow();
  } finally {
    spy.mockRestore();
    overlay.remove();
  }
});

it("does not update a line after its occurrence moves to another document", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const other = document.implementation.createHTMLDocument("other");
  const overlay = new BrowserInputRoot(root).createLineOverlay({
    className: "line",
    thickness: "4px",
  });
  try {
    overlay.update({ x: 1, y: 2, length: 10, orientation: "horizontal" });
    const line = root.querySelector<HTMLElement>(".line")!;
    other.body.append(root);
    expect(overlay.update({ x: 3, y: 4, length: 20, orientation: "horizontal" })).toBe(false);
    expect(line.style.transform).toBe("translate(1px, 2px)");
  } finally {
    overlay.remove();
    root.remove();
  }
});

it("retains a failed removal for a later cleanup attempt", () => {
  const root = document.createElement("div");
  const overlay = new BrowserInputRoot(root).createLineOverlay({
    className: "line",
    thickness: "4px",
  });
  overlay.update({ x: 1, y: 2, length: 10, orientation: "horizontal" });
  const line = root.querySelector(".line")!;
  const remove = jest.spyOn(line, "remove").mockImplementation(() => {
    throw new Error("removal failed");
  });
  try {
    expect(() => overlay.remove()).toThrow("removal failed");
    expect(root.querySelector(".line")).toBe(line);
    remove.mockRestore();
    overlay.remove();
    expect(root.querySelector(".line")).toBeNull();
  } finally {
    remove.mockRestore();
    overlay.remove();
  }
});

it.each([2, 40])("bounds ownership checks with %i mounted children", (count) => {
  const root = document.createElement("div");
  root.append(...Array.from({ length: count }, () => document.createElement("div")));
  const current = jest.fn(() => true);
  const overlay = new BrowserInputRoot(root, current).createLineOverlay({
    className: "line",
    thickness: "4px",
  });
  try {
    expect(overlay.update({ x: 1, y: 2, length: 10, orientation: "horizontal" })).toBe(true);
    expect(overlay.update({ x: 3, y: 4, length: 20, orientation: "vertical" })).toBe(true);
    expect(root.querySelector<HTMLElement>(".line")?.style.transform).toBe("translate(3px, 4px)");
    expect(current.mock.calls.length).toBeLessThanOrEqual(12);
  } finally {
    overlay.remove();
  }
});
