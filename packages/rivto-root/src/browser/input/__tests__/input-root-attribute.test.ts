import { BrowserInputRoot } from "../browser-input-root";

it("reads the current surface attribute only for its active attachment", () => {
  const element = document.createElement("div");
  const original = new BrowserInputRoot(element);
  expect(original.readAttribute("data-transforming")).toBeUndefined();
  element.setAttribute("data-transforming", "move");
  expect(original.readAttribute("data-transforming")).toBe("move");
  element.setAttribute("data-transforming", "");
  expect(original.readAttribute("data-transforming")).toBe("");
  original.detach();
  const replacement = new BrowserInputRoot(element);
  element.setAttribute("data-transforming", "resize");
  expect(original.readAttribute("data-transforming")).toBeUndefined();
  expect(replacement.readAttribute("data-transforming")).toBe("resize");
  replacement.detach();
});

it("discards an attribute value when reading it detaches the originating root", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const read = jest.spyOn(element, "getAttribute").mockImplementation(() => {
    root.detach();
    return "move";
  });
  try {
    expect(root.readAttribute("data-transforming")).toBeUndefined();
  } finally {
    read.mockRestore();
    root.detach();
  }
});
