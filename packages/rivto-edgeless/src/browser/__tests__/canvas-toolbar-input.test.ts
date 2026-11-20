/** @jest-environment jsdom */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { attachCanvasToolbarDismissal } from "../canvas-toolbar-input";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("releases the first document observation when the second registration fails", () => {
  const surface = document.createElement("div");
  const toolbar = document.createElement("div");
  surface.append(toolbar);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const observe = root.observeDocumentInput.bind(root);
  const remove = jestApi.spyOn(document, "removeEventListener");
  const spy = jestApi
    .spyOn(root, "observeDocumentInput")
    .mockImplementation((type, phase, listener) => {
      if (type === "pointerdown") {
        throw new Error("document listener failed");
      }
      return observe(type, phase, listener);
    });
  try {
    expect(() =>
      attachCanvasToolbarDismissal(
        toolbar,
        {
          inputRoot: root,
          coordinates: { isAttached: () => true },
        },
        () => {},
        { reset: () => {} },
      ),
    ).toThrow("document listener failed");
    expect(remove.mock.calls.some(([type]) => type === "keydown")).toBe(true);
    expect(root.isAttached()).toBe(true);
  } finally {
    spy.mockRestore();
    remove.mockRestore();
    root.detach();
    surface.remove();
  }
});

it("releases both document observations if the viewport changes during setup", () => {
  const surface = document.createElement("div");
  const toolbar = document.createElement("div");
  surface.append(toolbar);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  const observe = root.observeDocumentInput.bind(root);
  let current = true;
  const remove = jestApi.spyOn(document, "removeEventListener");
  const spy = jestApi
    .spyOn(root, "observeDocumentInput")
    .mockImplementation((type, phase, listener) => {
      const release = observe(type, phase, listener);
      if (type === "keydown") {
        current = false;
      }
      return release;
    });
  try {
    const detach = attachCanvasToolbarDismissal(
      toolbar,
      {
        inputRoot: root,
        coordinates: { isAttached: () => current },
      },
      () => {},
      { reset: () => {} },
    );
    expect(remove.mock.calls.some(([type]) => type === "keydown")).toBe(true);
    expect(remove.mock.calls.some(([type]) => type === "pointerdown")).toBe(true);
    detach();
    expect(root.isAttached()).toBe(true);
  } finally {
    spy.mockRestore();
    remove.mockRestore();
    root.detach();
    surface.remove();
  }
});

it("does not dismiss a replaced toolbar after tool reset changes the viewport", () => {
  const surface = document.createElement("div");
  const toolbar = document.createElement("div");
  surface.append(toolbar);
  document.body.append(surface);
  const root = new BrowserInputRoot(surface);
  let current = true;
  const setMenu = jestApi.fn();
  const reset = jestApi.fn(() => {
    current = false;
  });
  const detach = attachCanvasToolbarDismissal(
    toolbar,
    { inputRoot: root, coordinates: { isAttached: () => current } },
    setMenu,
    { reset },
  );
  try {
    toolbar.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(setMenu).not.toHaveBeenCalled();
  } finally {
    detach();
    root.detach();
    surface.remove();
  }
});
