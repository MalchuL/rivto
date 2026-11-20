import { BrowserInputRoot } from "../browser-input-root";

it("observes window wheel deltas without exposing browser events", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  const observer = jest.fn();
  const dispose = root.observeWindowWheel(observer);
  try {
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 17, deltaMode: 1 }));
    expect(observer).toHaveBeenCalledWith(17);
    root.detach();
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 30 }));
    expect(observer).toHaveBeenCalledTimes(1);
  } finally {
    dispose();
    dispose();
    root.detach();
  }
});

it("stops delivery after a document move and removes the captured window listener", () => {
  const surface = document.createElement("div");
  const root = new BrowserInputRoot(surface);
  const observer = jest.fn();
  const remove = jest.spyOn(window, "removeEventListener");
  const dispose = root.observeWindowWheel(observer);
  try {
    document.implementation.createHTMLDocument("other").adoptNode(surface);
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 10 }));
    expect(observer).not.toHaveBeenCalled();
    dispose();
    expect(remove).toHaveBeenCalledWith("wheel", expect.any(Function));
  } finally {
    dispose();
    remove.mockRestore();
    root.detach();
  }
});

it("does not deliver a wheel delta when reading it detaches the Root", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  const observer = jest.fn();
  const dispose = root.observeWindowWheel(observer);
  const event = new WheelEvent("wheel");
  Object.defineProperty(event, "deltaY", {
    get: () => {
      root.detach();
      return 10;
    },
  });
  try {
    window.dispatchEvent(event);
    expect(observer).not.toHaveBeenCalled();
  } finally {
    dispose();
    root.detach();
  }
});
