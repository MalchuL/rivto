import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("keeps a replacement installed during an older root ownership check", () => {
  const firstElement = document.createElement("div");
  const replacementElement = document.createElement("div");
  document.body.append(firstElement, replacementElement);
  const replacement = new BrowserInputRoot(replacementElement);
  const groups = [{ type: "click", target: "surface" as const, capture: false, passive: false }];
  const seen: object[] = [];
  const listeners = new BrowserEventListeners((_group, identity) => {
    if (identity) {
      seen.push(identity);
    }
  }, []);
  let replace = false;
  const first = new BrowserInputRoot(firstElement, () => {
    if (replace) {
      replace = false;
      listeners.connect(groups, new Set([replacement]));
    }
    return true;
  });
  try {
    listeners.connect(groups, new Set([first]));
    replace = true;
    listeners.connect(groups, new Set([first]));
    expect(replace).toBe(false);
    firstElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    replacementElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual([replacement.getElementIdentity()]);
  } finally {
    listeners.disconnect();
    first.detach();
    replacement.detach();
    firstElement.remove();
    replacementElement.remove();
  }
});

it("releases a listener if disconnection happens while it is being installed", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const listeners = new BrowserEventListeners(() => {}, []);
  const originalAdd = element.addEventListener.bind(element);
  const remove = jest.spyOn(element, "removeEventListener");
  const add = jest
    .spyOn(element, "addEventListener")
    .mockImplementation((type, listener, options) => {
      originalAdd(type, listener, options);
      listeners.disconnect();
    });
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      new Set([root]),
    );
    expect(remove).toHaveBeenCalledWith("click", expect.any(Function), false);
  } finally {
    add.mockRestore();
    listeners.disconnect();
    remove.mockRestore();
    root.detach();
    element.remove();
  }
});

it("releases an identity boundary disconnected during installation", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const listeners = new BrowserEventListeners(() => {}, [], true);
  const originalAdd = window.addEventListener.bind(window);
  const remove = jest.spyOn(window, "removeEventListener");
  const add = jest
    .spyOn(window, "addEventListener")
    .mockImplementation((type, listener, options) => {
      originalAdd(type, listener, options);
      listeners.disconnect();
    });
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      new Set([root]),
    );
    expect(remove).toHaveBeenCalledWith("click", expect.any(Function), true);
  } finally {
    add.mockRestore();
    listeners.disconnect();
    remove.mockRestore();
    root.detach();
    element.remove();
  }
});

it("releases a pointer boundary disconnected during installation", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const listeners = new BrowserEventListeners(() => {}, []);
  const originalAdd = window.addEventListener.bind(window);
  const remove = jest.spyOn(window, "removeEventListener");
  const add = jest
    .spyOn(window, "addEventListener")
    .mockImplementation((type, listener, options) => {
      originalAdd(type, listener, options);
      listeners.disconnect();
    });
  try {
    listeners.connect(
      [{ type: "pointermove", target: "surface", capture: false, passive: false }],
      new Set([root]),
    );
    expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function), true);
  } finally {
    add.mockRestore();
    listeners.disconnect();
    remove.mockRestore();
    root.detach();
    element.remove();
  }
});

it("does not reconnect after disconnection during an ownership check", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const groups = [{ type: "click", target: "surface" as const, capture: false, passive: false }];
  const seen: object[] = [];
  const listeners = new BrowserEventListeners((_group, identity) => {
    if (identity) {
      seen.push(identity);
    }
  }, []);
  let disconnect = false;
  const root = new BrowserInputRoot(element, () => {
    if (disconnect) {
      disconnect = false;
      listeners.disconnect();
    }
    return true;
  });
  try {
    listeners.connect(groups, new Set([root]));
    disconnect = true;
    listeners.connect(groups, new Set([root]));
    expect(disconnect).toBe(false);
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual([]);
  } finally {
    listeners.disconnect();
    root.detach();
    element.remove();
  }
});
