import { BrowserInputRoot } from "../../input/browser-input-root";

it("restores the original value only after all overlapping owners release", () => {
  const element = document.createElement("div");
  element.style.overflowAnchor = "auto";
  const first = new BrowserInputRoot(element);
  const second = new BrowserInputRoot(element);
  const releaseFirst = first.suspendScrollAnchoring();
  const releaseSecond = second.suspendScrollAnchoring();
  expect(element.style.overflowAnchor).toBe("none");
  first.detach();
  releaseFirst();
  expect(element.style.overflowAnchor).toBe("none");
  second.detach();
  releaseSecond();
  releaseSecond();
  expect(element.style.overflowAnchor).toBe("auto");
});

it("restores the style if the occurrence ends while suppression is applied", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  let value = "";
  Object.defineProperty(element.style, "overflowAnchor", {
    configurable: true,
    get: () => value,
    set: (next: string) => {
      value = next;
      if (next === "none") {
        root.detach();
      }
    },
  });
  try {
    root.suspendScrollAnchoring()();
    expect(element.style.overflowAnchor).toBe("");
  } finally {
    root.detach();
  }
});

it("rolls back a partially applied style when suppression fails", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  let value = "auto";
  Object.defineProperty(element.style, "overflowAnchor", {
    configurable: true,
    get: () => value,
    set: (next: string) => {
      value = next;
      if (next === "none") {
        throw new Error("style failure");
      }
    },
  });
  try {
    expect(() => root.suspendScrollAnchoring()).toThrow("style failure");
    expect(value).toBe("auto");
  } finally {
    root.detach();
  }
});
