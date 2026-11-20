import { BrowserInputRoot } from "../browser-input-root";

it("binds selection and focus to one attachment, including same-element remounts", () => {
  const element = document.createElement("div");
  element.tabIndex = -1;
  element.textContent = "text";
  document.body.append(element);
  const oldRoot = new BrowserInputRoot(element);
  const selection = document.getSelection()!;
  const focus = jest.spyOn(element, "focus");
  try {
    selection.setBaseAndExtent(element.firstChild!, 0, element.firstChild!, 2);
    oldRoot.clearSelection();
    expect(selection.rangeCount).toBe(0);
    oldRoot.focus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    oldRoot.detach();
    const current = new BrowserInputRoot(element);
    selection.setBaseAndExtent(element.firstChild!, 0, element.firstChild!, 2);
    focus.mockClear();
    oldRoot.clearSelection();
    oldRoot.focus();
    expect(selection.rangeCount).toBe(1);
    expect(focus).not.toHaveBeenCalled();
    current.clearSelection();
    current.focus();
    expect(selection.rangeCount).toBe(0);
    expect(focus).toHaveBeenCalledTimes(1);
    current.detach();
  } finally {
    focus.mockRestore();
    element.remove();
    selection.removeAllRanges();
  }
});
