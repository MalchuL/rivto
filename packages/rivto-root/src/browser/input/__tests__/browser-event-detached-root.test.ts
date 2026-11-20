import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it.each(["surface", "document", "window"] as const)(
  "does not dispatch or cancel %s input after its last Root detaches",
  (target) => {
    const element = document.createElement("div");
    document.body.append(element);
    const root = new BrowserInputRoot(element);
    let deliveries = 0;
    const listeners = new BrowserEventListeners(
      (_group, _identity, _capture, _dispatch, control) => {
        deliveries++;
        control.preventDefault();
      },
      [],
    );
    try {
      listeners.connect(
        [{ type: "click", target, capture: false, passive: false }],
        new Set([root]),
      );
      root.detach();
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      expect(deliveries).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      listeners.disconnect();
      root.detach();
      element.remove();
    }
  },
);

it("keeps a shared document listener for another active occurrence", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(first, second);
  const firstRoot = new BrowserInputRoot(first);
  const secondRoot = new BrowserInputRoot(second);
  const deliveries: Array<string> = [];
  const listeners = new BrowserEventListeners((group) => deliveries.push(group.target), []);
  try {
    listeners.connect(
      [
        { type: "click", target: "surface", capture: false, passive: false },
        { type: "click", target: "document", capture: false, passive: false },
      ],
      new Set([firstRoot, secondRoot]),
    );
    firstRoot.detach();
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    second.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deliveries).toEqual(["document", "surface", "document"]);
  } finally {
    listeners.disconnect();
    firstRoot.detach();
    secondRoot.detach();
    first.remove();
    second.remove();
  }
});

it("does not keep a detached document listener alive through another document's Root", () => {
  const otherDocument = document.implementation.createHTMLDocument("other");
  const first = document.createElement("div");
  const second = otherDocument.createElement("div");
  document.body.append(first);
  otherDocument.body.append(second);
  const firstRoot = new BrowserInputRoot(first);
  const secondRoot = new BrowserInputRoot(second);
  let deliveries = 0;
  const listeners = new BrowserEventListeners(() => {
    deliveries++;
  }, []);
  try {
    listeners.connect(
      [{ type: "click", target: "document", capture: false, passive: false }],
      new Set([firstRoot, secondRoot]),
    );
    firstRoot.detach();
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    second.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deliveries).toBe(1);
  } finally {
    listeners.disconnect();
    firstRoot.detach();
    secondRoot.detach();
    first.remove();
    second.remove();
  }
});

it("does not deliver from the old document after a Root moves to another document", () => {
  const otherDocument = document.implementation.createHTMLDocument("other");
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let deliveries = 0;
  const listeners = new BrowserEventListeners(() => {
    deliveries++;
  }, []);
  try {
    const groups = [{ type: "click", target: "document" as const, capture: false, passive: false }];
    listeners.connect(groups, new Set([root]));
    otherDocument.body.append(element);
    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deliveries).toBe(0);
    listeners.connect(groups, new Set([root]));
    otherDocument.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deliveries).toBe(1);
  } finally {
    listeners.disconnect();
    root.detach();
    element.remove();
  }
});

it("does not dispatch when an owner check disconnects the listener", () => {
  const element = document.createElement("div");
  document.body.append(element);
  let checks = 0;
  let deliveries = 0;
  const root = new BrowserInputRoot(element, () => {
    if (++checks === 2) {
      listeners.disconnect();
    }
    return true;
  });
  const listeners = new BrowserEventListeners(() => {
    deliveries++;
  }, []);
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      new Set([root]),
    );
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deliveries).toBe(0);
  } finally {
    listeners.disconnect();
    root.detach();
    element.remove();
  }
});

it("keeps the native event and surface private in the delivery control", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  let ownValues: unknown[] | undefined;
  const listeners = new BrowserEventListeners((_group, _identity, _capture, _dispatch, control) => {
    ownValues = Object.values(control);
    const { preventDefault } = control;
    preventDefault();
  }, []);
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      new Set([root]),
    );
    const event = new MouseEvent("click", { cancelable: true });
    element.dispatchEvent(event);
    expect(ownValues).toHaveLength(5);
    expect(ownValues?.every((value) => typeof value === "function")).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  } finally {
    listeners.disconnect();
    root.detach();
  }
});
