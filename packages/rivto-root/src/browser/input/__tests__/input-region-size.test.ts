import { createBrowserInputRegion } from "../input-region";

it("observes size changes only while the captured region is current", () => {
  const element = document.createElement("div");
  let attached = true;
  let notify: ResizeObserverCallback | undefined;
  const disconnect = jest.fn();
  const observe = jest.fn();
  const Observer = jest.fn().mockImplementation((callback: ResizeObserverCallback) => {
    notify = callback;
    return { observe, disconnect };
  });
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: Observer });
  try {
    const region = createBrowserInputRegion(element, element, () => attached);
    const changed = jest.fn();
    const release = region.observeSize(changed);
    expect(observe).toHaveBeenCalledWith(element);
    notify?.([], {} as ResizeObserver);
    expect(changed).toHaveBeenCalledTimes(1);
    attached = false;
    notify?.([], {} as ResizeObserver);
    expect(changed).toHaveBeenCalledTimes(1);
    release();
    release();
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
  }
});

it("disconnects when the occurrence ends while observation is installed", () => {
  const element = document.createElement("div");
  let attached = true;
  const disconnect = jest.fn();
  const Observer = jest.fn().mockImplementation(() => ({
    observe: () => {
      attached = false;
    },
    disconnect,
  }));
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: Observer });
  try {
    const region = createBrowserInputRegion(element, element, () => attached);
    const release = region.observeSize(jest.fn());
    expect(disconnect).toHaveBeenCalledTimes(1);
    release();
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
  }
});

it("reports when size observation is unavailable", () => {
  const element = document.createElement("div");
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: undefined });
  try {
    const region = createBrowserInputRegion(element, element, () => true);
    expect(() => region.observeSize(jest.fn())).toThrow("ResizeObserver is not available");
    expect(() => region.observeSize(jest.fn(), { allowUnavailable: true })()).not.toThrow();
  } finally {
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
  }
});

it("can observe the immediate children with the same resize observer", () => {
  const element = document.createElement("div");
  const child = document.createElement("div");
  const grandchild = document.createElement("div");
  element.append(child);
  child.append(grandchild);
  const observe = jest.fn();
  const disconnect = jest.fn();
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: jest.fn().mockImplementation(() => ({ observe, disconnect })),
  });
  try {
    const region = createBrowserInputRegion(element, element, () => true);
    const release = region.observeSize(jest.fn(), { includeChildren: true });
    expect(observe.mock.calls.map(([target]) => target)).toEqual([element, child]);
    release();
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
  }
});
