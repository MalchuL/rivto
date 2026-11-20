/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { attachTableResizeInput } from "../browser/table-resize-input";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("delivers normalized input only while the captured Root remains current", () => {
  const surface = document.createElement("div");
  const handle = document.createElement("div");
  surface.append(handle);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const replacement = new BrowserInputRoot(surface);
  let current = root;
  const controller = {
    start: jestApi.fn(),
    move: jestApi.fn(),
    finish: jestApi.fn(),
    resizeWithKeyboard: jestApi.fn(),
  };
  const detach = attachTableResizeInput(
    getBrowserElementIdentity(handle),
    controller,
    root,
    () => current === root,
  );
  try {
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 42 }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    expect(controller.start).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pointerdown", clientX: 42 }),
      expect.objectContaining({ feedback: expect.any(Object) }),
    );
    expect(controller.resizeWithKeyboard).toHaveBeenCalledTimes(1);
    current = replacement;
    handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    expect(controller.resizeWithKeyboard).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    root.detach();
    replacement.detach();
    surface.remove();
  }
});

it("releases earlier listeners when Root detaches during listener setup", () => {
  const surface = document.createElement("div");
  const handle = document.createElement("div");
  surface.append(handle);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const controller = {
    start: jestApi.fn(),
    move: jestApi.fn(),
    finish: jestApi.fn(),
    resizeWithKeyboard: jestApi.fn(),
  };
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
  try {
    const detach = attachTableResizeInput(
      getBrowserElementIdentity(handle),
      controller,
      root,
      () => true,
    );
    expect(remove.mock.calls.some(([type]) => type === "pointerdown")).toBe(true);
    detach();
  } finally {
    spy.mockRestore();
    remove.mockRestore();
    root.detach();
    surface.remove();
  }
});

it("rolls back installed listeners when a later registration throws", () => {
  const surface = document.createElement("div");
  const handle = document.createElement("div");
  surface.append(handle);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const controller = {
    start: jestApi.fn(),
    move: jestApi.fn(),
    finish: jestApi.fn(),
    resizeWithKeyboard: jestApi.fn(),
  };
  const add = handle.addEventListener.bind(handle);
  const remove = jestApi.spyOn(handle, "removeEventListener");
  const spy = jestApi
    .spyOn(handle, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "pointermove") {
        throw new Error("listener failed");
      }
      add(type, listener, options);
    });
  try {
    expect(() =>
      attachTableResizeInput(getBrowserElementIdentity(handle), controller, root, () => true),
    ).toThrow("listener failed");
    expect(remove.mock.calls.some(([type]) => type === "pointerdown")).toBe(true);
  } finally {
    spy.mockRestore();
    remove.mockRestore();
    root.detach();
    surface.remove();
  }
});

it("releases installed listeners when the panel Root changes during setup", () => {
  const surface = document.createElement("div");
  const handle = document.createElement("div");
  surface.append(handle);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const replacement = new BrowserInputRoot(surface);
  let current = root;
  const controller = {
    start: jestApi.fn(),
    move: jestApi.fn(),
    finish: jestApi.fn(),
    resizeWithKeyboard: jestApi.fn(),
  };
  const add = handle.addEventListener.bind(handle);
  const remove = jestApi.spyOn(handle, "removeEventListener");
  const spy = jestApi
    .spyOn(handle, "addEventListener")
    .mockImplementation((type, listener, options) => {
      add(type, listener, options);
      if (type === "pointermove") {
        current = replacement;
      }
    });
  try {
    const detach = attachTableResizeInput(
      getBrowserElementIdentity(handle),
      controller,
      root,
      () => current === root,
    );
    expect(remove.mock.calls.some(([type]) => type === "pointerdown")).toBe(true);
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(controller.start).not.toHaveBeenCalled();
    detach();
  } finally {
    spy.mockRestore();
    remove.mockRestore();
    root.detach();
    replacement.detach();
    surface.remove();
  }
});
