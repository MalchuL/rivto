/** @jest-environment ./jest-browser-environment.mjs */
import { attachBentoResizeInput, captureBentoResizePlacement } from "../browser/bento-resize-input";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("retains the Root-captured placement and invalidates it when the tile moves", () => {
  const { lane, handle } = createMountedHandle();
  const root = new BrowserInputRoot(lane);
  try {
    const separator = root.captureRegionByIdentity(getBrowserElementIdentity(handle))!;
    const placement = captureBentoResizePlacement(separator)!;
    expect(placement.tile.getIdentity()).toBe(
      getBrowserElementIdentity(handle.closest(".rivto-bento-tile")!),
    );
    expect(placement.lane.getIdentity()).toBe(getBrowserElementIdentity(lane));
    expect(placement.tile.getIdentity()).toBeDefined();
    const wrapper = document.createElement("div");
    lane.append(wrapper);
    wrapper.append(handle.closest(".rivto-bento-tile")!);
    expect(placement.tile.getIdentity()).toBeUndefined();
    expect(placement.lane.getIdentity()).toBeUndefined();
  } finally {
    root.detach();
    lane.remove();
  }
});

it("delivers normalized pointer, lost-capture and keyboard input to a separator", () => {
  const handle = document.createElement("div");
  handle.dataset.bentoResizeEdge = "right";
  document.body.append(handle);
  const inputRoot = new BrowserInputRoot(handle);
  const controller = createController();
  const detach = attachBentoResizeInput(getBrowserElementIdentity(handle), "right", controller, {
    inputRoot,
    subscribeAvailability: () => () => {},
  });
  try {
    for (const type of ["pointerdown", "pointermove", "lostpointercapture"]) {
      const event = new MouseEvent(type, { bubbles: true, clientX: 42 });
      Object.defineProperty(event, "pointerId", { value: 7 });
      handle.dispatchEvent(event);
    }
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(controller.start).toHaveBeenCalledWith(
      "right",
      expect.objectContaining({ type: "pointerdown", pointerId: 7, clientX: 42 }),
      expect.objectContaining({
        feedback: expect.any(Object),
        subscribeCancellation: expect.any(Function),
      }),
    );
    const input = controller.finish.mock.calls[0]![0];
    expect(input).toEqual(expect.objectContaining({ type: "lostpointercapture", pointerId: 7 }));
    expect(input).not.toBeInstanceOf(Event);
    expect(controller.finish.mock.calls[0]![1]).toBe(false);
    expect(controller.resizeWithKeyboard).toHaveBeenCalledWith(
      "right",
      expect.objectContaining({ key: "ArrowRight" }),
    );
    detach();
    inputRoot.detach();
    handle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(controller.move).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    handle.remove();
  }
});

it("cancels a gesture when its panel Root is replaced on the same element", () => {
  const { lane, handle } = createMountedHandle();
  let inputRoot = new BrowserInputRoot(lane);
  const original = inputRoot;
  const listeners = new Set<() => void>();
  const panel = {
    /**
     * Reads the test panel's current occurrence.
     *
     * @returns Root currently exposed by the panel.
     */
    get inputRoot() {
      return inputRoot;
    },
    /**
     * Retains one availability observer for the fixture.
     *
     * @param listener - Called when the fixture replaces its Root.
     * @returns Disposer removing the retained observer.
     */
    subscribeAvailability(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const controller = createController();
  const detach = attachBentoResizeInput(
    getBrowserElementIdentity(handle),
    "right",
    controller,
    panel,
  );
  try {
    const event = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    handle.dispatchEvent(event);
    const gesture = controller.start.mock.calls[0]![2];
    expect(gesture.placement).toBeDefined();
    const cancel = jestApi.fn();
    const stop = gesture.subscribeCancellation(cancel);
    inputRoot = new BrowserInputRoot(lane);
    expect(gesture.placement.tile.readLayoutWidth()).toBeUndefined();
    for (const listener of [...listeners]) {
      listener();
    }
    expect(cancel).toHaveBeenCalledTimes(1);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(controller.resizeWithKeyboard).toHaveBeenCalledTimes(1);
    stop();
  } finally {
    detach();
    inputRoot.detach();
    original.detach();
    lane.remove();
  }
});

it("binds a mounted separator when its panel Root becomes available", () => {
  const { lane, handle } = createMountedHandle();
  let inputRoot: BrowserInputRoot | undefined;
  let notify = () => {};
  const panel = {
    /**
     * Supplies the Root currently installed by the test.
     *
     * @returns The mounted occurrence, or undefined before attachment.
     */
    get inputRoot() {
      return inputRoot;
    },
    /**
     * Retains the binding's availability callback until cleanup.
     *
     * @param listener - Callback invoked after the fixture changes Root.
     * @returns Disposer removing the retained callback.
     */
    subscribeAvailability(listener: () => void) {
      notify = listener;
      return () => {
        notify = () => {};
      };
    },
  };
  const controller = createController();
  const detach = attachBentoResizeInput(
    getBrowserElementIdentity(handle),
    "right",
    controller,
    panel,
  );
  try {
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(controller.resizeWithKeyboard).not.toHaveBeenCalled();
    inputRoot = new BrowserInputRoot(lane);
    notify();
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(controller.resizeWithKeyboard).toHaveBeenCalledTimes(1);
    detach();
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(controller.resizeWithKeyboard).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    inputRoot?.detach();
    lane.remove();
  }
});

it("retains the replacement when the Root changes during separator capture", () => {
  const { lane, handle } = createMountedHandle();
  const first = new BrowserInputRoot(lane);
  const second = new BrowserInputRoot(lane);
  let inputRoot = first;
  const listeners = new Set<() => void>();
  const panel = {
    /**
     * Supplies the Root currently installed by the test.
     *
     * @returns The panel's current occurrence.
     */
    get inputRoot() {
      return inputRoot;
    },
    /**
     * Retains the binding's availability callback until cleanup.
     *
     * @param listener - Callback invoked after the fixture changes Root.
     * @returns Disposer removing that callback.
     */
    subscribeAvailability(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const originalCapture = first.captureRegionByIdentity.bind(first);
  jestApi.spyOn(first, "captureRegionByIdentity").mockImplementationOnce((identity, current) => {
    inputRoot = second;
    for (const listener of [...listeners]) {
      listener();
    }
    return originalCapture(identity, current);
  });
  const controller = createController();
  const detach = attachBentoResizeInput(
    getBrowserElementIdentity(handle),
    "right",
    controller,
    panel,
  );
  try {
    expect(inputRoot).toBe(second);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(controller.resizeWithKeyboard).toHaveBeenCalledTimes(1);
    expect(second.captureRegionByIdentity(getBrowserElementIdentity(handle))).toBeDefined();
  } finally {
    detach();
    first.detach();
    second.detach();
    lane.remove();
  }
});

it("keeps a replacement installed during an old Root availability check", () => {
  const { lane, handle } = createMountedHandle();
  const first = new BrowserInputRoot(lane);
  const second = new BrowserInputRoot(lane);
  let inputRoot = first;
  const listeners = new Set<() => void>();
  const panel = {
    /**
     * Supplies the Root currently installed by the test.
     *
     * @returns The panel's current occurrence.
     */
    get inputRoot() {
      return inputRoot;
    },
    /**
     * Retains the binding's availability callback until cleanup.
     *
     * @param listener - Callback invoked after the fixture changes Root.
     * @returns Disposer removing that callback.
     */
    subscribeAvailability(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const controller = createController();
  const detach = attachBentoResizeInput(
    getBrowserElementIdentity(handle),
    "right",
    controller,
    panel,
  );
  try {
    jestApi.spyOn(first, "isAttached").mockImplementationOnce(() => {
      inputRoot = second;
      for (const listener of [...listeners]) {
        listener();
      }
      return false;
    });
    for (const listener of [...listeners]) {
      listener();
    }
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(controller.resizeWithKeyboard).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    first.detach();
    second.detach();
    lane.remove();
  }
});

it("rolls back installed region listeners when separator setup fails", () => {
  const { lane, handle } = createMountedHandle();
  const root = new BrowserInputRoot(lane);
  const releaseAvailability = jestApi.fn();
  const panel = { inputRoot: root, subscribeAvailability: () => releaseAvailability };
  const controller = createController();
  const add = handle.addEventListener.bind(handle);
  const remove = jestApi.spyOn(handle, "removeEventListener");
  const failure = jestApi
    .spyOn(handle, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "pointermove") {
        throw new Error("separator listener failed");
      }
      add(type, listener, options);
    });
  try {
    expect(() =>
      attachBentoResizeInput(getBrowserElementIdentity(handle), "right", controller, panel),
    ).toThrow("separator listener failed");
    expect(remove.mock.calls.some(([type]) => type === "pointerdown")).toBe(true);
    expect(releaseAvailability).toHaveBeenCalledTimes(1);
    failure.mockRestore();
    const detach = attachBentoResizeInput(
      getBrowserElementIdentity(handle),
      "right",
      controller,
      panel,
    );
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(controller.resizeWithKeyboard).toHaveBeenCalledTimes(1);
    detach();
  } finally {
    failure.mockRestore();
    remove.mockRestore();
    root.detach();
    lane.remove();
  }
});

it("releases earlier listeners if the Root detaches during separator setup", () => {
  const { lane, handle } = createMountedHandle();
  const root = new BrowserInputRoot(lane);
  const panel = { inputRoot: root, subscribeAvailability: () => () => {} };
  const controller = createController();
  const add = handle.addEventListener.bind(handle);
  const remove = jestApi.spyOn(handle, "removeEventListener");
  const spy = jestApi
    .spyOn(handle, "addEventListener")
    .mockImplementation((type, listener, options) => {
      add(type, listener, options);
      if (type === "pointermove") {
        root.detach();
      }
    });
  let detach: (() => void) | undefined;
  try {
    detach = attachBentoResizeInput(getBrowserElementIdentity(handle), "right", controller, panel);
    expect(remove.mock.calls.some(([type]) => type === "pointerdown")).toBe(true);
  } finally {
    detach?.();
    spy.mockRestore();
    remove.mockRestore();
    root.detach();
    lane.remove();
  }
});

it("attempts all separator cleanup when one listener removal fails", () => {
  const { lane, handle } = createMountedHandle();
  const root = new BrowserInputRoot(lane);
  const releaseAvailability = jestApi.fn();
  const panel = { inputRoot: root, subscribeAvailability: () => releaseAvailability };
  const controller = createController();
  const detach = attachBentoResizeInput(
    getBrowserElementIdentity(handle),
    "right",
    controller,
    panel,
  );
  const removeOriginal = handle.removeEventListener.bind(handle);
  const remove = jestApi
    .spyOn(handle, "removeEventListener")
    .mockImplementation((type, listener, options) => {
      removeOriginal(type, listener, options);
      if (type === "pointerdown") {
        throw new Error("separator cleanup failed");
      }
    });
  try {
    expect(detach).toThrow("separator cleanup failed");
    expect(releaseAvailability).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls.some(([type]) => type === "keydown")).toBe(true);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(controller.resizeWithKeyboard).not.toHaveBeenCalled();
    detach();
  } finally {
    remove.mockRestore();
    detach();
    root.detach();
    lane.remove();
  }
});

/**
 * Mounts a resize handle inside a Bento tile and sibling lane.
 *
 * @returns The lane and handle used by the fixture.
 */
function createMountedHandle() {
  const lane = document.createElement("div");
  const tile = document.createElement("div");
  const handle = document.createElement("div");
  tile.className = "rivto-bento-tile";
  handle.dataset.bentoResizeEdge = "right";
  tile.append(handle);
  lane.append(tile);
  document.body.append(lane);
  return { lane, handle };
}

/**
 * Creates gesture spies for an attached resize separator.
 *
 * @returns A controller whose input calls can be inspected.
 */
function createController() {
  return {
    start: jestApi.fn(),
    move: jestApi.fn(),
    finish: jestApi.fn(),
    resizeWithKeyboard: jestApi.fn(),
  };
}
