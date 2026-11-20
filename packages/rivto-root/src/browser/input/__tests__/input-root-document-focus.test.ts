import { BrowserInputRoot } from "../browser-input-root";

it("reads document focus only while the originating registration is current", () => {
  const element = document.createElement("div");
  let current = true;
  const root = new BrowserInputRoot(element, () => current);
  const focus = jest.spyOn(document, "hasFocus").mockReturnValue(true);
  try {
    expect(root.isDocumentFocused()).toBe(true);
    focus.mockReturnValue(false);
    expect(root.isDocumentFocused()).toBe(false);
    current = false;
    focus.mockClear();
    expect(root.isDocumentFocused()).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    root.detach();
    focus.mockRestore();
  }
});
