import { BlockAutoScroll } from "./block-auto-scroll";

it("scrolls the nearest container, falls back to the page at its limit, and cancels frames", () => {
  const container = document.createElement("div");
  container.style.overflowY = "auto";
  const root = document.createElement("div");
  container.append(root);
  document.body.append(container);
  Object.defineProperties(container, {
    scrollHeight: { value: 500 },
    clientHeight: { value: 100 },
  });
  jest
    .spyOn(container, "getBoundingClientRect")
    .mockReturnValue({ top: 100, bottom: 200 } as DOMRect);
  const oldHit = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const oldScroll = Object.getOwnPropertyDescriptor(document, "scrollingElement");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => root });
  Object.defineProperty(document, "scrollingElement", {
    configurable: true,
    value: document.documentElement,
  });
  const callbacks = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callbacks.set(++sequence, callback);
    return sequence;
  });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });
  const refresh = jest.fn();
  const scroll = new BlockAutoScroll(root, refresh);
  scroll.update({ x: 20, y: 195 });
  scroll.update({ x: 20, y: 195 });
  expect(callbacks.size).toBe(1);
  callbacks.get(1)!(0);
  callbacks.delete(1);
  expect(container.scrollTop).toBeGreaterThan(0);
  expect(document.documentElement.scrollTop).toBe(0);
  expect(refresh).toHaveBeenCalledTimes(1);
  Object.defineProperty(container, "scrollTop", {
    configurable: true,
    get: () => 400,
    set: () => {},
  });
  scroll.update({ x: 20, y: window.innerHeight - 1 });
  callbacks.get(2)!(0);
  callbacks.delete(2);
  expect(document.documentElement.scrollTop).toBeGreaterThan(0);
  scroll.stop();
  expect(callbacks.size).toBe(0);
  expect(cancel).toHaveBeenCalled();
  jest.restoreAllMocks();
  if (oldHit) {
    Object.defineProperty(document, "elementFromPoint", oldHit);
  } else {
    Reflect.deleteProperty(document, "elementFromPoint");
  }
  if (oldScroll) {
    Object.defineProperty(document, "scrollingElement", oldScroll);
  } else {
    Reflect.deleteProperty(document, "scrollingElement");
  }
  document.documentElement.scrollTop = 0;
  container.remove();
});

it("skips idle hit-test frames but probes live geometry once an edge can scroll", () => {
  const container = document.createElement("div");
  const root = document.createElement("div");
  container.style.overflowY = "auto";
  container.append(root);
  document.body.append(container);
  Object.defineProperties(container, {
    scrollHeight: { value: 500 },
    clientHeight: { value: 100 },
  });
  jest
    .spyOn(container, "getBoundingClientRect")
    .mockReturnValue({ top: 100, bottom: 200 } as DOMRect);
  const descriptor = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const hit = jest.fn(() => root);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
  let frame: FrameRequestCallback | undefined;
  const request = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 42;
  });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    frame = undefined;
  });
  const refresh = jest.fn();
  const scroll = new BlockAutoScroll(root, refresh);
  try {
    scroll.update({ x: 20, y: 150 }, root);
    expect(request).not.toHaveBeenCalled();
    scroll.update({ x: 20, y: 195 }, root);
    expect(container.scrollTop).toBe(0);
    expect(request).toHaveBeenCalledTimes(1);
    scroll.update({ x: 20, y: 150 }, root);
    expect(cancel).toHaveBeenCalledWith(42);
    expect(frame).toBeUndefined();
    expect(hit).not.toHaveBeenCalled();
    scroll.update({ x: 20, y: 195 }, root);
    frame!(0);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.scrollTop).toBeGreaterThan(0);
    scroll.stop();
    container.scrollTop = 400;
    const requests = request.mock.calls.length;
    scroll.update({ x: 20, y: 195 }, root);
    expect(request).toHaveBeenCalledTimes(requests);
  } finally {
    scroll.stop();
    jest.restoreAllMocks();
    if (descriptor) {
      Object.defineProperty(document, "elementFromPoint", descriptor);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    container.remove();
  }
});

it("keeps a locked document stationary in both preflight and scheduled frames", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const overflow = document.body.style.overflowY;
  const descriptor = Object.getOwnPropertyDescriptor(document, "scrollingElement");
  const hitDescriptor = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const page = document.documentElement;
  Object.defineProperty(document, "scrollingElement", { configurable: true, value: page });
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => root });
  page.scrollTop = 200;
  document.body.style.overflowY = "hidden";
  let frame: FrameRequestCallback | undefined;
  const request = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 42;
  });
  const refresh = jest.fn();
  const scroll = new BlockAutoScroll(root, refresh);
  try {
    scroll.update({ x: 20, y: 5 }, root);
    expect(request).not.toHaveBeenCalled();
    scroll.update({ x: 20, y: 5 });
    frame!(0);
    expect(page.scrollTop).toBe(200);
    expect(refresh).not.toHaveBeenCalled();
  } finally {
    scroll.stop();
    document.body.style.overflowY = overflow;
    page.scrollTop = 0;
    jest.restoreAllMocks();
    if (descriptor) {
      Object.defineProperty(document, "scrollingElement", descriptor);
    } else {
      Reflect.deleteProperty(document, "scrollingElement");
    }
    if (hitDescriptor) {
      Object.defineProperty(document, "elementFromPoint", hitDescriptor);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    root.remove();
  }
});
