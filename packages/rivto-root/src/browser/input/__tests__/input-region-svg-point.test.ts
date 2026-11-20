import { createBrowserInputRegion } from "../input-region";

it("converts a viewport point using the current SVG transform and rejects stale regions", () => {
  const previous = Object.getOwnPropertyDescriptor(window, "SVGGraphicsElement");
  Object.defineProperty(window, "SVGGraphicsElement", { configurable: true, value: SVGElement });
  const root = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  root.append(svg);
  svg.append(circle);
  let attached = true;
  const region = createBrowserInputRegion(root, circle, () => attached);
  const inverse = jest.fn(() => ({ a: 0, b: -2, c: 2, d: 0, e: 3, f: 4 }));
  Object.defineProperty(circle, "getScreenCTM", {
    configurable: true,
    value: () => ({ inverse }),
  });
  try {
    expect(region.clientToSvgPoint({ x: 10, y: 20 })).toEqual({ x: 43, y: -16 });
    inverse.mockImplementation(() => {
      attached = false;
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    });
    expect(region.clientToSvgPoint({ x: 10, y: 20 })).toBeUndefined();
    expect(region.clientToSvgPoint({ x: 10, y: 20 })).toBeUndefined();
  } finally {
    if (previous) {
      Object.defineProperty(window, "SVGGraphicsElement", previous);
    } else {
      Reflect.deleteProperty(window, "SVGGraphicsElement");
    }
  }
});

it("does not convert a non-SVG region", () => {
  const root = document.createElement("div");
  const element = document.createElement("div");
  root.append(element);
  const region = createBrowserInputRegion(root, element, () => true);
  expect(region.clientToSvgPoint({ x: 10, y: 20 })).toBeUndefined();
});
