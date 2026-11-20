import { createBrowserInputRegion } from "../input-region";

it("returns detached bounds only while the original region remains attached", () => {
  const root = document.createElement("div");
  const element = document.createElement("div");
  root.append(element);
  let attached = true;
  const region = createBrowserInputRegion(root, element, () => attached);
  const rect = { left: 10, top: 20, width: 30, height: 40 };
  jest.spyOn(element, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
  expect(region.readBounds()).toEqual(rect);
  jest.spyOn(element, "getBoundingClientRect").mockImplementation(() => {
    attached = false;
    return rect as DOMRect;
  });
  expect(region.readBounds()).toBeUndefined();
  expect(region.readBounds()).toBeUndefined();
});
