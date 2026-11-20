import { observeDocumentOffsetAndFollowEnd } from "../observe-document-offset";

it("measures the host and follows the document end until scrolling away or disposal", () => {
  const host = document.createElement("div");
  const root = document.createElement("div");
  const callback = jest.fn();
  const disconnect = jest.fn();
  const resize = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: jest.fn(() => ({ observe: jest.fn(), disconnect })),
  });
  const measure = jest.spyOn(host, "getBoundingClientRect").mockReturnValue({ top: 25 } as DOMRect);
  const frame = jest.spyOn(window, "requestAnimationFrame").mockReturnValue(12);
  const scrollTo = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const originalOffset = Object.getOwnPropertyDescriptor(window, "scrollY")!;
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight")!;
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
  const height = jest.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(500);
  try {
    const dispose = observeDocumentOffsetAndFollowEnd(host, root, callback);
    expect(callback).toHaveBeenCalledWith(25);
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(frame).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "scrollY", { configurable: true, value: -100 });
    window.dispatchEvent(new Event("scroll"));
    frame.mock.calls[0]![0](0);
    expect(scrollTo).not.toHaveBeenCalled();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    frame.mock.calls[1]![0](0);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "instant" });
    window.dispatchEvent(new Event("resize"));
    dispose();
    dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(12);
    const count = callback.mock.calls.length;
    window.dispatchEvent(new Event("resize"));
    expect(callback).toHaveBeenCalledTimes(count);
  } finally {
    measure.mockRestore();
    frame.mockRestore();
    scrollTo.mockRestore();
    cancel.mockRestore();
    height.mockRestore();
    Object.defineProperty(window, "scrollY", originalOffset);
    Object.defineProperty(window, "innerHeight", originalInnerHeight);
    if (resize) {
      Object.defineProperty(globalThis, "ResizeObserver", resize);
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  }
});

it("disconnects the resize observer when observation setup fails", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  const disconnect = jest.fn();
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: jest.fn(() => ({
      observe: () => {
        throw new Error("resize setup failed");
      },
      disconnect,
    })),
  });
  try {
    expect(() =>
      observeDocumentOffsetAndFollowEnd(
        document.createElement("div"),
        document.createElement("div"),
        jest.fn(),
      ),
    ).toThrow("resize setup failed");
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  }
});

it("removes listeners even when disconnecting the resize observer fails", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: jest.fn(() => ({
      observe: jest.fn(),
      disconnect: () => {
        throw new Error("disconnect failed");
      },
    })),
  });
  const callback = jest.fn();
  try {
    const dispose = observeDocumentOffsetAndFollowEnd(
      document.createElement("div"),
      document.createElement("div"),
      callback,
    );
    expect(dispose).toThrow(AggregateError);
    window.dispatchEvent(new Event("resize"));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(dispose).not.toThrow();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  }
});
