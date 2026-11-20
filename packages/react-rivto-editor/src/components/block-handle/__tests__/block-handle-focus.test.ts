/** @jest-environment jsdom */
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { restoreBlockHandleFocus } from "../block-handle-focus";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("restores focus through the captured Root while preserving browser scrolling", () => {
  const element = document.createElement("div");
  const handle = document.createElement("button");
  element.append(handle);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const focus = jestApi.spyOn(handle, "focus");
  try {
    const menu = { inputRoot: root, identity: getBrowserElementIdentity(handle) };
    restoreBlockHandleFocus({ inputRoot: root }, menu);
    expect(focus).toHaveBeenCalledWith({ preventScroll: false });
    expect(document.activeElement).toBe(handle);
    root.detach();
    restoreBlockHandleFocus({ inputRoot: root }, menu);
    expect(focus).toHaveBeenCalledTimes(1);
  } finally {
    focus.mockRestore();
    root.detach();
    element.remove();
  }
});

it("does not focus the old handle when its panel has a replacement Root", () => {
  const element = document.createElement("div");
  const handle = document.createElement("button");
  element.append(handle);
  document.body.append(element);
  const original = new BrowserInputRoot(element);
  const replacement = new BrowserInputRoot(element);
  const focus = jestApi.spyOn(handle, "focus");
  try {
    restoreBlockHandleFocus(
      { inputRoot: replacement },
      { inputRoot: original, identity: getBrowserElementIdentity(handle) },
    );
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    original.detach();
    replacement.detach();
    element.remove();
  }
});
