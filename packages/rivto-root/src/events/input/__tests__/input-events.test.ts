import { BrowserInputRoot } from "../../../browser/input/browser-input-root";
import { InputEvents } from "../input-events";
import type { InputEventsRoot } from "../types";

it("dispatches and releases input with only the observer and attachment capabilities", () => {
  const element = document.createElement("div");
  const browserRoot = new BrowserInputRoot(element);
  const root: InputEventsRoot = {
    createInputObserver: () => browserRoot.createInputObserver(),
    isAttached: () => browserRoot.isAttached(),
  };
  const events = new InputEvents<InputEventsRoot, InputEventsRoot>(
    { assertActive: () => {}, registerCleanup: (release) => release },
    (_target, _input, occurrence) => occurrence,
  );
  const received = jest.fn();
  events.register("click", { type: "click", priority: 0 }, received);
  const detach = events.attach(root);
  try {
    element.click();
    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0][0]).toBe(root);
    detach();
    element.click();
    expect(received).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    browserRoot.detach();
  }
});

it("preserves phase snapshots and observers after an earlier handler claims input", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const events = new InputEvents(
    { assertActive: () => {}, registerCleanup: (release) => release },
    (_target, input) => input,
  );
  const seen: string[] = [];
  let added = false;
  events.register("capture", { type: "click", capture: true, priority: 0 }, () => {
    seen.push("capture");
    if (!added) {
      added = true;
      events.register(
        "later",
        { type: "click", priority: 0 },
        () => {
          seen.push("later");
        },
        true,
      );
    }
    return "handled";
  });
  events.register(
    "observer",
    { type: "click", priority: 0 },
    () => {
      seen.push("observer");
    },
    true,
  );
  events.register("handler", { type: "click", priority: 0 }, () => {
    seen.push("handler");
    return "continue";
  });
  const detach = events.attach(root);
  try {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(seen).toEqual(["capture", "observer"]);
    seen.length = 0;
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(seen).toEqual(["capture", "observer", "later"]);
  } finally {
    detach();
    root.detach();
    element.remove();
  }
});

it("stops observers and handlers when an observer detaches the occurrence", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const events = new InputEvents(
    { assertActive: () => {}, registerCleanup: (release) => release },
    (_target, input) => input,
  );
  const seen: string[] = [];
  let detach = () => {};
  events.register(
    "first",
    { type: "click", priority: 1 },
    () => {
      seen.push("first");
      detach();
    },
    true,
  );
  events.register(
    "later",
    { type: "click", priority: 0 },
    () => {
      seen.push("later");
    },
    true,
  );
  events.register("handler", { type: "click", priority: 0 }, () => {
    seen.push("handler");
    return "continue";
  });
  detach = events.attach(root);
  try {
    element.click();
    expect(seen).toEqual(["first"]);
  } finally {
    detach();
    root.detach();
  }
});

it("does not deliver when event context creation detaches its Root", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  let detach = () => {};
  const events = new InputEvents(
    { assertActive: () => {}, registerCleanup: (release) => release },
    (_target, input) => {
      detach();
      return input;
    },
  );
  const handler = jest.fn();
  events.register("handler", { type: "click", priority: 0 }, handler);
  detach = events.attach(root);
  try {
    element.click();
    expect(handler).not.toHaveBeenCalled();
  } finally {
    detach();
    root.detach();
  }
});
