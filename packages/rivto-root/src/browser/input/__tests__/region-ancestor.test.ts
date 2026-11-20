import { BrowserInputRoot } from "../browser-input-root";

it("finds a region's ancestor without crossing occurrence boundaries or escaping its identity", () => {
  const element = document.createElement("div");
  element.setAttribute("data-panel", "");
  element.innerHTML = `
    <div data-owner="parent">
      <div data-owner="child&quot;[test]"></div>
      <div data-panel><div data-owner="embedded"></div></div>
    </div>`;
  const root = new BrowserInputRoot(element);
  const query = {
    regionSelector: "[data-owner]",
    identityAttribute: "data-owner",
    identity: 'child"[test]',
    ancestorSelector: "[data-owner]",
    boundarySelector: "[data-panel]",
  };
  expect(root.hasRegionAncestor(query)).toBe(true);
  expect(root.hasRegionAncestor({ ...query, identity: "parent" })).toBe(false);
  expect(root.hasRegionAncestor({ ...query, identity: "embedded" })).toBe(false);
  expect(root.hasRegionAncestor({ ...query, identity: "missing" })).toBe(false);
  root.detach();
  expect(root.hasRegionAncestor(query)).toBe(false);
});

it("discards the ancestor result when ownership ends during the lookup", () => {
  const element = document.createElement("div");
  element.setAttribute("data-panel", "");
  element.innerHTML = '<div data-owner="parent"><div data-owner="child"></div></div>';
  const root = new BrowserInputRoot(element);
  const child = element.querySelector('[data-owner="child"]')!;
  const read = child.getAttribute.bind(child);
  jest.spyOn(child, "getAttribute").mockImplementation((name) => {
    const value = read(name);
    root.detach();
    return value;
  });
  expect(
    root.hasRegionAncestor({
      regionSelector: "[data-owner]",
      identityAttribute: "data-owner",
      identity: "child",
      ancestorSelector: "[data-owner]",
      boundarySelector: "[data-panel]",
    }),
  ).toBe(false);
});
