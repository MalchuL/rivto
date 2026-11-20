/** @jest-environment jsdom */
import { attachCanvasControlAccessibility } from "../canvas-control-accessibility";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("marks handles, dispatches keyboard transforms, and removes its listener and host markers", () => {
  const box = document.createElement("div");
  box.innerHTML =
    '<div class="moveable-control" data-direction="se"></div><div class="moveable-rotation-control"></div>';
  document.body.append(box);
  const root = new BrowserInputRoot(box);
  const resize = box.querySelector<HTMLElement>('[data-direction="se"]')!;
  const rotate = box.querySelector<HTMLElement>(".moveable-rotation-control")!;
  const request = jestApi.fn();
  const release = attachCanvasControlAccessibility(
    box,
    "shape",
    false,
    () => {
      expect(resize.getAttribute("data-canvas-resize-handle")).toBe("se");
      return {
        box: { "data-host-control": "yes" },
        resizeHandle: "data-host-resize",
        rotationHandle: "data-host-rotation",
      };
    },
    () => ({ request }),
    root,
    () => true,
  );
  try {
    expect(resize.getAttribute("aria-label")).toBe("Resize se");
    expect(rotate.getAttribute("aria-label")).toBe("Rotate element");
    const arrow = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    resize.dispatchEvent(arrow);
    expect(request).toHaveBeenCalledWith(
      "resizable",
      { direction: [1, 1], deltaWidth: 10, deltaHeight: 0 },
      true,
    );
    expect(arrow.defaultPrevented).toBe(true);
    rotate.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
    );
    expect(request).toHaveBeenCalledWith("rotatable", { deltaRotate: -1 }, true);
    release();
    resize.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(request).toHaveBeenCalledTimes(2);
    expect(box.hasAttribute("data-host-control")).toBe(false);
    expect(resize.hasAttribute("data-host-resize")).toBe(false);
  } finally {
    root.detach();
    box.remove();
  }
});

it("stops keyboard input and focus restoration when its viewport is replaced", () => {
  const box = document.createElement("div");
  box.innerHTML = '<div class="moveable-control" data-direction="e"></div>';
  document.body.append(box);
  const handle = box.firstElementChild as HTMLElement;
  const root = new BrowserInputRoot(box);
  let current = true;
  const request = jestApi.fn().mockImplementation(() => {
    current = false;
    document.body.focus();
  });
  const focus = jestApi.spyOn(handle, "focus");
  const release = attachCanvasControlAccessibility(
    box,
    "shape",
    false,
    () => undefined,
    () => ({ request }),
    root,
    () => current,
  );
  try {
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    release();
    root.detach();
    box.remove();
  }
});

it("removes host markers when Root listener setup fails", () => {
  const box = document.createElement("div");
  document.body.append(box);
  const root = new BrowserInputRoot(box);
  const capture = jestApi.spyOn(root, "captureRegionByIdentity").mockImplementation(() => {
    throw new Error("capture failed");
  });
  try {
    expect(() =>
      attachCanvasControlAccessibility(
        box,
        "shape",
        false,
        () => ({
          box: { "data-host-control": "yes" },
          resizeHandle: "data-host-resize",
          rotationHandle: "data-host-rotation",
        }),
        () => null,
        root,
        () => true,
      ),
    ).toThrow("capture failed");
    expect(box.hasAttribute("data-host-control")).toBe(false);
  } finally {
    capture.mockRestore();
    root.detach();
    box.remove();
  }
});

it("removes host markers even when listener cleanup fails", () => {
  const box = document.createElement("div");
  document.body.append(box);
  const root = new BrowserInputRoot(box);
  const release = attachCanvasControlAccessibility(
    box,
    "shape",
    false,
    () => ({
      box: { "data-host-control": "yes" },
      resizeHandle: "data-host-resize",
      rotationHandle: "data-host-rotation",
    }),
    () => null,
    root,
    () => true,
  );
  const remove = jestApi.spyOn(box, "removeEventListener").mockImplementationOnce(() => {
    throw new Error("listener cleanup failed");
  });
  try {
    expect(release).toThrow("listener cleanup failed");
    expect(box.hasAttribute("data-host-control")).toBe(false);
  } finally {
    remove.mockRestore();
    root.detach();
    box.remove();
  }
});
