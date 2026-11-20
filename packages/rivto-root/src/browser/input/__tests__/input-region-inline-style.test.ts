import { createBrowserInputRegion } from "../input-region";

it("reads inline declarations only while the region belongs to its Root", () => {
  const root = document.createElement("div");
  const element = document.createElement("div");
  root.append(element);
  element.style.transform = "translate(12px, 8px)";
  let attached = true;
  const region = createBrowserInputRegion(root, element, () => attached);
  expect(region.readInlineStyle("transform")).toBe("translate(12px, 8px)");
  expect(region.readInlineStyle("width")).toBe("");
  attached = false;
  expect(region.readInlineStyle("transform")).toBeUndefined();
});

it("discards a style read when the region is detached during that read", () => {
  const root = document.createElement("div");
  const element = document.createElement("div");
  root.append(element);
  let attached = true;
  const read = jest.spyOn(element.style, "getPropertyValue").mockImplementation(() => {
    attached = false;
    return "240px";
  });
  try {
    const region = createBrowserInputRegion(root, element, () => attached);
    expect(region.readInlineStyle("width")).toBeUndefined();
  } finally {
    read.mockRestore();
  }
});
