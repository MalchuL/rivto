import { BrowserInputRoot } from "../browser-input-root";

it("checks owner identity before browser operations and never revives after detach", () => {
  const element = document.createElement("div");
  let current = true;
  const root = new BrowserInputRoot(element, () => current);
  const focus = jest.spyOn(element, "focus");
  const selection = jest.spyOn(document, "getSelection");
  try {
    expect(root.isAttached()).toBe(true);
    current = false;
    root.focus();
    root.clearSelection();
    expect(focus).not.toHaveBeenCalled();
    expect(selection).not.toHaveBeenCalled();
    current = true;
    root.focus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    root.detach();
    expect(root.isAttached()).toBe(false);
    focus.mockClear();
    root.focus();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    selection.mockRestore();
  }
});
