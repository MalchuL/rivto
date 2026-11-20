import { BrowserInputRoot } from "../../input/browser-input-root";

it("renders inert text and removes its overlay after detachment", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const overlay = root.createTextOverlay();
  try {
    expect(
      overlay.create({
        className: "preview",
        text: "2 items",
        lines: [{ className: "row", text: "<b>inert</b>", indent: 24 }],
      }),
    ).toBe(true);
    overlay.move(10, 20);
    const preview = element.querySelector<HTMLElement>(".preview")!;
    expect(overlay.isCreated()).toBe(true);
    expect(preview.querySelector("b")).toBeNull();
    expect(preview.querySelector<HTMLElement>(".row")?.textContent).toBe("<b>inert</b>");
    expect(preview.querySelector<HTMLElement>(".row")?.style.marginInlineStart).toBe("24px");
    expect(preview.style.transform).toBe("translate3d(10px, 20px, 0)");
    expect(() => overlay.create({ className: "again", text: "", lines: [] })).toThrow(
      "Text overlay already created",
    );
    root.detach();
    overlay.move(40, 50);
    expect(preview.style.transform).toBe("translate3d(10px, 20px, 0)");
    overlay.remove();
    expect(overlay.isCreated()).toBe(false);
    expect(element.querySelector(".preview")).toBeNull();
  } finally {
    overlay.remove();
    element.remove();
  }
});

it("does not create an overlay after its occurrence is detached", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const overlay = root.createTextOverlay();
  root.detach();
  expect(overlay.create({ className: "preview", text: "text", lines: [] })).toBe(false);
  expect(overlay.isCreated()).toBe(false);
  expect(element.childElementCount).toBe(0);
});

it("retains a partially created overlay for cleanup after attachment failure", () => {
  const element = document.createElement("div");
  const overlay = new BrowserInputRoot(element).createTextOverlay();
  const append = jest.spyOn(element, "append").mockImplementation(() => {
    throw new Error("attachment failed");
  });
  try {
    expect(() => overlay.create({ className: "preview", text: "text", lines: [] })).toThrow(
      "attachment failed",
    );
    expect(overlay.isCreated()).toBe(true);
    expect(() => overlay.remove()).not.toThrow();
  } finally {
    append.mockRestore();
  }
});

it("retains a failed removal for a later cleanup attempt", () => {
  const element = document.createElement("div");
  const overlay = new BrowserInputRoot(element).createTextOverlay();
  overlay.create({ className: "preview", text: "text", lines: [] });
  const preview = element.querySelector(".preview")!;
  const remove = jest.spyOn(preview, "remove").mockImplementation(() => {
    throw new Error("removal failed");
  });
  try {
    expect(() => overlay.remove()).toThrow("removal failed");
    expect(overlay.isCreated()).toBe(true);
    remove.mockRestore();
    overlay.remove();
    expect(overlay.isCreated()).toBe(false);
    expect(element.querySelector(".preview")).toBeNull();
  } finally {
    remove.mockRestore();
    overlay.remove();
  }
});

it("removes a node appended after reentrant overlay cancellation", () => {
  const element = document.createElement("div");
  const overlay = new BrowserInputRoot(element).createTextOverlay();
  const append = element.append.bind(element);
  const spy = jest.spyOn(element, "append").mockImplementation((...nodes) => {
    overlay.remove();
    append(...nodes);
  });
  try {
    expect(overlay.create({ className: "preview", text: "text", lines: [] })).toBe(false);
    expect(overlay.isCreated()).toBe(false);
    expect(element.querySelector(".preview")).toBeNull();
  } finally {
    spy.mockRestore();
    overlay.remove();
  }
});

it("does not append when an ownership check releases the pending overlay", () => {
  const element = document.createElement("div");
  let checks = 0;
  const root = new BrowserInputRoot(element, () => {
    if (++checks === 2) {
      overlay.remove();
    }
    return true;
  });
  const overlay = root.createTextOverlay();
  const append = jest.spyOn(element, "append");
  try {
    expect(overlay.create({ className: "preview", text: "text", lines: [] })).toBe(false);
    expect(append).not.toHaveBeenCalled();
    expect(overlay.isCreated()).toBe(false);
  } finally {
    append.mockRestore();
    overlay.remove();
  }
});

it("does not start creating after removal during the initial ownership check", () => {
  const element = document.createElement("div");
  let checks = 0;
  const root = new BrowserInputRoot(element, () => {
    if (++checks === 1) {
      overlay.remove();
    }
    return true;
  });
  const overlay = root.createTextOverlay();
  expect(overlay.create({ className: "preview", text: "text", lines: [] })).toBe(false);
  expect(element.querySelector(".preview")).toBeNull();
});

it("rejects and removes an overlay redirected outside its occurrence", () => {
  const element = document.createElement("div");
  const other = document.createElement("div");
  const overlay = new BrowserInputRoot(element).createTextOverlay();
  const append = jest.spyOn(element, "append").mockImplementation((...nodes) => {
    other.append(...nodes);
  });
  try {
    expect(overlay.create({ className: "preview", text: "text", lines: [] })).toBe(false);
    expect(overlay.isCreated()).toBe(false);
    expect(other.querySelector(".preview")).toBeNull();
  } finally {
    append.mockRestore();
    overlay.remove();
  }
});

it("does not write after an ownership check releases the overlay during movement", () => {
  const element = document.createElement("div");
  let cancel = false;
  const root = new BrowserInputRoot(element, () => {
    if (cancel) {
      overlay.remove();
    }
    return true;
  });
  const overlay = root.createTextOverlay();
  overlay.create({ className: "preview", text: "text", lines: [] });
  cancel = true;
  expect(() => overlay.move(1, 2)).not.toThrow();
  expect(element.querySelector(".preview")).toBeNull();
});

it("does not move an overlay reparented outside its originating occurrence", () => {
  const element = document.createElement("div");
  const other = document.createElement("div");
  const overlay = new BrowserInputRoot(element).createTextOverlay();
  overlay.create({ className: "preview", text: "text", lines: [] });
  const preview = element.querySelector<HTMLElement>(".preview")!;
  try {
    overlay.move(1, 2);
    other.append(preview);
    overlay.move(3, 4);
    expect(preview.style.transform).toBe("translate3d(1px, 2px, 0)");
  } finally {
    overlay.remove();
  }
});

it("does not move an overlay after its occurrence moves to another document", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const other = document.implementation.createHTMLDocument("other");
  const overlay = new BrowserInputRoot(element).createTextOverlay();
  overlay.create({ className: "preview", text: "text", lines: [] });
  const preview = element.querySelector<HTMLElement>(".preview")!;
  try {
    overlay.move(1, 2);
    other.body.append(element);
    overlay.move(3, 4);
    expect(preview.style.transform).toBe("translate3d(1px, 2px, 0)");
  } finally {
    overlay.remove();
    element.remove();
  }
});

it("does not create an overlay after its occurrence moves to another document", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const other = document.implementation.createHTMLDocument("other");
  const overlay = new BrowserInputRoot(element).createTextOverlay();
  try {
    other.body.append(element);
    expect(overlay.create({ className: "preview", text: "text", lines: [] })).toBe(false);
    expect(element.querySelector(".preview")).toBeNull();
  } finally {
    overlay.remove();
    element.remove();
  }
});

it.each([2, 40])("bounds ownership checks with %i mounted children", (count) => {
  const element = document.createElement("div");
  element.append(...Array.from({ length: count }, () => document.createElement("div")));
  const current = jest.fn(() => true);
  const overlay = new BrowserInputRoot(element, current).createTextOverlay();
  try {
    expect(overlay.create({ className: "preview", text: "text", lines: [] })).toBe(true);
    overlay.move(1, 2);
    expect(element.querySelector<HTMLElement>(".preview")?.style.transform).toBe(
      "translate3d(1px, 2px, 0)",
    );
    expect(current.mock.calls.length).toBeLessThanOrEqual(6);
  } finally {
    overlay.remove();
  }
});
