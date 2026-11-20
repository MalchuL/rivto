import { BrowserInputRoot } from "../browser-input-root";

it("reads the occurrence's viewport and stops after detachment", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  expect(root.readViewport()).toEqual({ width: window.innerWidth, height: window.innerHeight });
  root.detach();
  expect(root.readViewport()).toBeUndefined();
});

it("discards dimensions when the occurrence changes document during the read", () => {
  const element = document.createElement("div");
  const otherDocument = document.implementation.createHTMLDocument();
  let checks = 0;
  const root = new BrowserInputRoot(element, () => {
    if (++checks === 2) {
      otherDocument.adoptNode(element);
    }
    return true;
  });
  expect(root.readViewport()).toBeUndefined();
  root.detach();
});
