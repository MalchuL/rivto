import { BrowserInputRoot } from "../browser-input-root";

it("rejects an occurrence detached by its own owner check", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element, () => {
    root.detach();
    return true;
  });
  try {
    const marker = root.captureDocumentAttribute("data-test-marker");
    marker.set();
    expect(root.isAttached()).toBe(false);
    expect(document.documentElement.hasAttribute("data-test-marker")).toBe(false);
  } finally {
    element.remove();
    document.documentElement.removeAttribute("data-test-marker");
  }
});

it("rejects a captured region when its registration check detaches the mount", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  const region = root.captureRegionByIdentity(root.getElementIdentity(), () => {
    root.detach();
    return true;
  });
  expect(region).toBeUndefined();
});

it("skips the region lifetime check once the mount has detached", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  const current = jest.fn(() => true);
  root.detach();
  expect(root.captureRegionByIdentity(root.getElementIdentity(), current)).toBeUndefined();
  expect(current).not.toHaveBeenCalled();
});

it("evaluates the mount owner once even if its callback detaches an unrelated Root", () => {
  const unrelated = new BrowserInputRoot(document.createElement("div"));
  const current = jest.fn(() => {
    unrelated.detach();
    return true;
  });
  const root = new BrowserInputRoot(document.createElement("div"), current);
  expect(root.isAttached()).toBe(true);
  expect(current).toHaveBeenCalledTimes(1);
});
