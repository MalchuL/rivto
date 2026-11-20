import type { BrowserInputMap } from "../../../events/types";
import * as browser from "../../../browser";
import { BrowserInputRoot } from "../../input/browser-input-root";
import { BrowserRoutedEvents } from "../browser-routed-events";

it("exports routed events without exposing low-level listener ownership", () => {
  expect(browser.BrowserRoutedEvents).toBe(BrowserRoutedEvents);
  expect("BrowserEventListeners" in browser).toBe(false);
});

it("keeps dispatch snapshots across phases and excludes newly registered handlers", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const seen: string[] = [];
  const events = new BrowserRoutedEvents<BrowserInputMap[keyof BrowserInputMap]>(
    () => new Set([root]),
    (_group, _identity, capture) => {
      const input = capture(root);
      return input;
    },
    [],
  );
  let added = false;
  const capture = {
    id: "capture",
    type: "click",
    target: "surface" as const,
    capture: true,
    passive: false,
    preventDefault: true,
  };
  const bubble = {
    id: "bubble",
    type: "click",
    target: "surface" as const,
    capture: false,
    passive: false,
    preventDefault: true,
  };
  events.register(capture, () => {
    seen.push("capture");
    if (!added) {
      added = true;
      events.register({ ...bubble, id: "later" }, () => {
        seen.push("later");
      });
    }
  });
  events.register(bubble, () => {
    seen.push("bubble");
  });
  try {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(seen).toEqual(["capture", "bubble"]);
    seen.length = 0;
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(seen).toEqual(["capture", "bubble", "later"]);
  } finally {
    events.destroy();
    root.detach();
    element.remove();
  }
});

it("claims across listener groups without cancelling when configured", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const seen: string[] = [];
  const events = new BrowserRoutedEvents<BrowserInputMap[keyof BrowserInputMap]>(
    () => new Set([root]),
    (_group, _identity, capture) => {
      const input = capture(root);
      return input;
    },
    [],
  );
  events.register(
    {
      id: "capture",
      type: "click",
      target: "surface",
      capture: true,
      passive: false,
      preventDefault: false,
    },
    () => {
      seen.push("capture");
      return true;
    },
  );
  events.register(
    {
      id: "bubble",
      type: "click",
      target: "surface",
      capture: false,
      passive: false,
      preventDefault: true,
    },
    () => {
      seen.push("bubble");
    },
  );
  try {
    const input = new MouseEvent("click", { bubbles: true, cancelable: true });
    element.dispatchEvent(input);
    expect(input.defaultPrevented).toBe(false);
    expect(seen).toEqual(["capture"]);
  } finally {
    events.destroy();
    root.detach();
    element.remove();
  }
});

it.each([
  { passive: false, prevented: true },
  { passive: true, prevented: false },
])("applies the browser cancellation policy for passive=$passive", ({ passive, prevented }) => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const events = new BrowserRoutedEvents(
    () => new Set([root]),
    (_group, _identity, capture) => capture(root),
    [],
  );
  events.register(
    {
      id: "input",
      type: "click",
      target: "surface",
      capture: false,
      passive,
      preventDefault: true,
    },
    () => true,
  );
  try {
    const input = new MouseEvent("click", { bubbles: true, cancelable: true });
    element.dispatchEvent(input);
    expect(input.defaultPrevented).toBe(prevented);
  } finally {
    events.destroy();
    root.detach();
  }
});

it("releases a failed registration so its identity can be reused", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const events = new BrowserRoutedEvents(
    () => new Set([root]),
    () => undefined,
    [],
  );
  const definition = {
    id: "input",
    type: "click",
    target: "surface" as const,
    capture: false,
    passive: false,
    preventDefault: true,
  };
  const add = jest.spyOn(element, "addEventListener").mockImplementation(() => {
    throw new Error("attach failed");
  });
  try {
    expect(() => events.register(definition, () => {})).toThrow("attach failed");
    add.mockRestore();
    expect(() => events.register(definition, () => {})).not.toThrow();
  } finally {
    add.mockRestore();
    events.destroy();
    root.detach();
  }
});

it("does not attach listeners after destruction during Root lookup", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const add = jest.spyOn(element, "addEventListener");
  const events = new BrowserRoutedEvents(
    () => {
      events.destroy();
      return new Set([root]);
    },
    () => undefined,
    [],
  );
  try {
    expect(() =>
      events.register(
        {
          id: "input",
          type: "click",
          target: "surface",
          capture: false,
          passive: false,
          preventDefault: true,
        },
        () => {},
      ),
    ).toThrow("destroyed during setup");
    expect(add).not.toHaveBeenCalled();
  } finally {
    add.mockRestore();
    events.destroy();
    root.detach();
  }
});
