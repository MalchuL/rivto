import { BrowserInputRoot } from "../browser-input-root";

it("updates mounted attributes and inert state only while the Root is attached", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  root.setAttribute("role", "region");
  root.setInert(true);
  expect(element.getAttribute("role")).toBe("region");
  expect(element.inert).toBe(true);
  root.setInert(false);
  expect(element.inert).toBe(false);
  root.detach();
  root.setAttribute("role", "main");
  root.setInert(true);
  expect(element.getAttribute("role")).toBe("region");
  expect(element.inert).toBe(false);
});
