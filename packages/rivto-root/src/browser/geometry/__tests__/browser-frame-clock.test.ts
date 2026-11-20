import { BrowserInputRoot } from "../../input/browser-input-root";

it("runs an accepted frame after detachment so its owner can clean up", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  let frame: FrameRequestCallback | undefined;
  const request = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const callback = jest.fn();
  try {
    const clock = root.captureFrameClock()!;
    expect(clock.now()).toEqual(expect.any(Number));
    expect(clock.requestFrame(callback)).toEqual(expect.any(Function));
    root.detach();
    expect(clock.now()).toBeUndefined();
    expect(clock.requestFrame(jest.fn())).toBeUndefined();
    frame!(0);
    expect(callback).toHaveBeenCalledTimes(1);
  } finally {
    request.mockRestore();
    root.detach();
  }
});

it("rejects new frames after the captured Root moves to another document", () => {
  const surface = document.createElement("div");
  const root = new BrowserInputRoot(surface);
  try {
    const clock = root.captureFrameClock()!;
    document.implementation.createHTMLDocument("other").adoptNode(surface);
    expect(clock.now()).toBeUndefined();
    expect(clock.requestFrame(jest.fn())).toBeUndefined();
  } finally {
    root.detach();
  }
});

it("cancels a pending frame once even after the Root detaches", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  let frame: FrameRequestCallback | undefined;
  const request = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 23;
  });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const callback = jest.fn();
  try {
    const release = root.captureFrameClock()!.requestFrame(callback)!;
    root.detach();
    release();
    release();
    frame!(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(23);
    expect(callback).not.toHaveBeenCalled();
  } finally {
    cancel.mockRestore();
    request.mockRestore();
    root.detach();
  }
});
