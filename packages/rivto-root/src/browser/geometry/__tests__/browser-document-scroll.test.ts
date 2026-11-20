import { BrowserInputRoot } from "../../input/browser-input-root";

it("adjusts the captured document scroll only while its Root remains attached", () => {
  const surface = document.createElement("div");
  const scrolling = document.createElement("div");
  const previous = Object.getOwnPropertyDescriptor(document, "scrollingElement");
  Object.defineProperty(document, "scrollingElement", { configurable: true, value: scrolling });
  const root = new BrowserInputRoot(surface);
  try {
    scrolling.scrollTop = 20;
    const scroll = root.captureDocumentScroll();
    expect(scroll).toBeDefined();
    scroll!.adjustBy(15);
    expect(scrolling.scrollTop).toBe(35);
    root.detach();
    scroll!.adjustBy(10);
    expect(scrolling.scrollTop).toBe(35);
    expect(root.captureDocumentScroll()).toBeUndefined();
  } finally {
    root.detach();
    if (previous) {
      Object.defineProperty(document, "scrollingElement", previous);
    } else {
      Reflect.deleteProperty(document, "scrollingElement");
    }
  }
});

it("does not adjust the old document after its Root moves to another document", () => {
  const surface = document.createElement("div");
  const scrolling = document.createElement("div");
  const previous = Object.getOwnPropertyDescriptor(document, "scrollingElement");
  Object.defineProperty(document, "scrollingElement", { configurable: true, value: scrolling });
  const root = new BrowserInputRoot(surface);
  try {
    const scroll = root.captureDocumentScroll()!;
    document.implementation.createHTMLDocument("other").adoptNode(surface);
    scroll.adjustBy(10);
    expect(scrolling.scrollTop).toBe(0);
  } finally {
    root.detach();
    if (previous) {
      Object.defineProperty(document, "scrollingElement", previous);
    } else {
      Reflect.deleteProperty(document, "scrollingElement");
    }
  }
});

it("does not write if reading scroll position detaches the captured Root", () => {
  const surface = document.createElement("div");
  const scrolling = document.createElement("div");
  const previous = Object.getOwnPropertyDescriptor(document, "scrollingElement");
  Object.defineProperty(document, "scrollingElement", { configurable: true, value: scrolling });
  const root = new BrowserInputRoot(surface);
  const write = jest.fn();
  Object.defineProperty(scrolling, "scrollTop", {
    configurable: true,
    get: () => {
      root.detach();
      return 20;
    },
    set: write,
  });
  try {
    root.captureDocumentScroll()!.adjustBy(5);
    expect(write).not.toHaveBeenCalled();
  } finally {
    root.detach();
    if (previous) {
      Object.defineProperty(document, "scrollingElement", previous);
    } else {
      Reflect.deleteProperty(document, "scrollingElement");
    }
  }
});
