import { BrowserInputRoot } from "../browser-input-root";

it("distinguishes focus on the surface from focus inside it and rejects stale roots", () => {
  const element = document.createElement("div");
  const child = document.createElement("button");
  element.tabIndex = -1;
  element.append(child);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  try {
    child.focus();
    expect(root.hasFocus()).toBe(true);
    expect(root.isFocused()).toBe(false);
    element.focus();
    expect(root.isFocused()).toBe(true);
    root.detach();
    expect(root.isFocused()).toBe(false);
    const replacement = new BrowserInputRoot(element);
    expect(replacement.isFocused()).toBe(true);
    expect(root.isFocused()).toBe(false);
    replacement.detach();
  } finally {
    element.remove();
  }
});
