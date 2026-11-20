import { BrowserInputListeners } from "../browser-input-listeners";

it("focuses an SVG target inside the input Root without scrolling", () => {
  const root = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("data-radius", "");
  const focus = jest.fn();
  Object.defineProperty(circle, "focus", { value: focus });
  root.append(svg);
  svg.append(circle);
  document.body.append(root);
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (input) => {
    input.focusTargetAncestor("[data-radius]");
  });
  const detach = listeners.attach(root);
  try {
    circle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  } finally {
    detach();
    root.remove();
  }
});

it("does not focus a matching ancestor outside the input Root", () => {
  const parent = document.createElement("div");
  const root = document.createElement("div");
  const child = document.createElement("span");
  parent.dataset.focus = "";
  parent.append(root);
  root.append(child);
  document.body.append(parent);
  const focus = jest.spyOn(parent, "focus");
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (input) => {
    input.focusTargetAncestor("[data-focus]");
  });
  const detach = listeners.attach(root);
  try {
    child.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(focus).not.toHaveBeenCalled();
  } finally {
    detach();
    focus.mockRestore();
    parent.remove();
  }
});
