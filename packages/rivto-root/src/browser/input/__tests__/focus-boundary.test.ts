import { BrowserInputRoot } from "../browser-input-root";

it("recognizes focus only in its own attached boundary", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  const local = document.createElement("input");
  const nested = document.createElement("input");
  outer.dataset.editor = "";
  inner.dataset.editor = "";
  outer.append(local, inner);
  inner.append(nested);
  document.body.append(outer);
  const root = new BrowserInputRoot(outer);
  try {
    local.focus();
    expect(root.hasFocusWithin("[data-editor]")).toBe(true);
    nested.focus();
    expect(root.hasFocusWithin("[data-editor]")).toBe(false);
    local.focus();
    root.detach();
    expect(root.hasFocusWithin("[data-editor]")).toBe(false);
  } finally {
    root.detach();
    outer.remove();
  }
});

it("discards focus membership when the attachment is released during boundary lookup", () => {
  const element = document.createElement("div");
  const input = document.createElement("input");
  element.dataset.editor = "";
  element.append(input);
  document.body.append(element);
  input.focus();
  const root = new BrowserInputRoot(element);
  const closest = input.closest.bind(input);
  const spy = jest.spyOn(input, "closest").mockImplementation((selector) => {
    const boundary = closest(selector);
    root.detach();
    return boundary;
  });
  try {
    expect(root.hasFocusWithin("[data-editor]")).toBe(false);
  } finally {
    spy.mockRestore();
    root.detach();
    element.remove();
  }
});

it("discards focus membership when focus changes during boundary lookup", () => {
  const element = document.createElement("div");
  const input = document.createElement("input");
  const outside = document.createElement("button");
  element.dataset.editor = "";
  element.append(input);
  document.body.append(element, outside);
  input.focus();
  const root = new BrowserInputRoot(element);
  const closest = input.closest.bind(input);
  const spy = jest.spyOn(input, "closest").mockImplementation((selector) => {
    const boundary = closest(selector);
    outside.focus();
    return boundary;
  });
  try {
    expect(root.hasFocusWithin("[data-editor]")).toBe(false);
  } finally {
    spy.mockRestore();
    root.detach();
    element.remove();
    outside.remove();
  }
});
