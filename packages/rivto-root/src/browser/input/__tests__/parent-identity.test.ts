import { BrowserInputRoot } from "../browser-input-root";

it("identifies the nearest matching parent only while the occurrence is attached", () => {
  const outer = document.createElement("div");
  const parent = document.createElement("div");
  const child = document.createElement("div");
  outer.dataset.panel = "";
  parent.dataset.panel = "";
  outer.append(parent);
  parent.append(child);
  const parentRoot = new BrowserInputRoot(parent);
  const childRoot = new BrowserInputRoot(child);
  expect(childRoot.getParentIdentity("[data-panel]")).toBe(parentRoot.getElementIdentity());
  expect(childRoot.getParentIdentity("[data-missing]")).toBeUndefined();
  childRoot.detach();
  expect(childRoot.getParentIdentity("[data-panel]")).toBeUndefined();
  parentRoot.detach();
});
