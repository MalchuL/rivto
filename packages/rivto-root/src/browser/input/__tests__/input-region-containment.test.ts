import { createBrowserInputRegion } from "../input-region";

it("compares active regions without exposing their browser elements", () => {
  const root = document.createElement("div");
  const child = document.createElement("div");
  root.append(child);
  let attached = true;
  const parentRegion = createBrowserInputRegion(root, root, () => attached);
  const childRegion = createBrowserInputRegion(root, child, () => attached);
  const nestedRegion = createBrowserInputRegion(child, child, () => true);
  const outside = document.createElement("div");
  const outsideRegion = createBrowserInputRegion(outside, outside, () => true);
  expect(parentRegion).toHaveProperty("containsRegion");
  expect(parentRegion.containsRegion(childRegion)).toBe(true);
  expect(parentRegion.containsRegion(nestedRegion)).toBe(true);
  expect(parentRegion.containsRegion(outsideRegion)).toBe(false);
  expect(parentRegion.isInSameDocument(outsideRegion)).toBe(true);
  const foreignDocument = document.implementation.createHTMLDocument("foreign");
  const foreignRoot = foreignDocument.createElement("div");
  const foreignRegion = createBrowserInputRegion(foreignRoot, foreignRoot, () => true);
  expect(parentRegion.isInSameDocument(foreignRegion)).toBe(false);
  expect(childRegion.containsRegion(parentRegion)).toBe(false);
  attached = false;
  expect(parentRegion.containsRegion(childRegion)).toBe(false);
  expect(parentRegion.isInSameDocument(nestedRegion)).toBe(false);
});
