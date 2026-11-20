import { BrowserInputRoot } from "../browser-input-root";

it("restores a surface attribute after detachment and ignores repeated cleanup", () => {
  const element = document.createElement("div");
  element.setAttribute("data-state", "before");
  const root = new BrowserInputRoot(element);
  const release = root.setTemporaryAttribute("data-state", "active");
  expect(element.getAttribute("data-state")).toBe("active");
  root.detach();
  release();
  release();
  expect(element.getAttribute("data-state")).toBe("before");
  root.setTemporaryAttribute("data-state", "ignored")();
  expect(element.getAttribute("data-state")).toBe("before");
});

it("keeps a newer temporary value when an older occurrence releases its marker", () => {
  const element = document.createElement("div");
  element.setAttribute("data-state", "before");
  const oldRoot = new BrowserInputRoot(element);
  const releaseOld = oldRoot.setTemporaryAttribute("data-state", "old");
  oldRoot.detach();
  const newRoot = new BrowserInputRoot(element);
  const releaseNew = newRoot.setTemporaryAttribute("data-state", "new");
  releaseOld();
  expect(element.getAttribute("data-state")).toBe("new");
  releaseNew();
  expect(element.getAttribute("data-state")).toBe("before");
});

it("restores the previous temporary owner when the newest owner finishes first", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const releaseFirst = root.setTemporaryAttribute("data-state", "first");
  const releaseSecond = root.setTemporaryAttribute("data-state", "second");
  releaseSecond();
  expect(element.getAttribute("data-state")).toBe("first");
  releaseFirst();
  expect(element.hasAttribute("data-state")).toBe(false);
});
