import { attachTestBrowserEvents } from "../../../test-utils/attach-test-browser-events";
import { BrowserEvents } from "../browser-events";

it("defers registrations added during capture until the next native dispatch", () => {
  const root = document.createElement("div");
  const events = new BrowserEvents();
  const calls: string[] = [];
  let registered = false;
  events.register({
    id: "capture",
    type: "click",
    capture: true,
    handle: () => {
      calls.push("capture");
      if (!registered) {
        registered = true;
        events.register({
          id: "added",
          type: "click",
          handle: () => {
            calls.push("added");
          },
        });
      }
    },
  });
  events.register({
    id: "bubble",
    type: "click",
    handle: () => {
      calls.push("bubble");
    },
  });
  const detach = attachTestBrowserEvents(events, root);
  const click = new MouseEvent("click", { bubbles: true });
  root.dispatchEvent(click);
  expect(calls).toEqual(["capture", "bubble"]);
  root.dispatchEvent(click);
  expect(calls).toEqual(["capture", "bubble", "capture", "bubble", "added"]);
  detach();
});

it("gives each nested redispatch its own snapshot after listener groups change", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const events = new BrowserEvents();
  const calls: string[] = [];
  let releaseCapture = () => {};
  releaseCapture = events.register({
    id: "pointer-capture",
    type: "pointerdown",
    capture: true,
    handle: () => {
      calls.push("capture");
      releaseCapture();
      events.register({
        id: "pointer-bubble",
        type: "pointerdown",
        handle: () => {
          calls.push("bubble");
        },
      });
    },
  });
  events.register({
    id: "outer",
    type: "click",
    handle: () => {
      const pointer = new MouseEvent("pointerdown", { bubbles: true });
      root.dispatchEvent(pointer);
      root.dispatchEvent(pointer);
    },
  });
  const detach = attachTestBrowserEvents(events, root);
  root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(calls).toEqual(["capture", "bubble"]);
  detach();
  root.remove();
});

it("uses current registrations when an event object is reused with a different listener group", () => {
  const root = document.createElement("div");
  const events = new BrowserEvents();
  const calls: string[] = [];
  const releaseCapture = events.register({
    id: "capture",
    type: "click",
    capture: true,
    handle: () => {
      calls.push("capture");
    },
  });
  const detach = attachTestBrowserEvents(events, root);
  const click = new MouseEvent("click", { bubbles: true });
  root.dispatchEvent(click);
  releaseCapture();
  events.register({
    id: "bubble",
    type: "click",
    handle: () => {
      calls.push("bubble");
    },
  });
  root.dispatchEvent(click);
  expect(calls).toEqual(["capture", "bubble"]);
  detach();
});

it("starts a snapshot when the first registration is installed after window capture", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const events = new BrowserEvents();
  const calls: string[] = [];
  const detach = attachTestBrowserEvents(events, root);
  window.addEventListener(
    "click",
    () => {
      events.register({
        id: "capture",
        type: "click",
        capture: true,
        handle: () => {
          calls.push("capture");
          events.register({
            id: "bubble",
            type: "click",
            handle: () => {
              calls.push("bubble");
            },
          });
        },
      });
    },
    { capture: true, once: true },
  );
  root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(calls).toEqual(["capture"]);
  detach();
  root.remove();
});

it("rolls back dispatch boundaries when listener installation fails", () => {
  const root = document.createElement("div");
  const events = new BrowserEvents();
  const detach = attachTestBrowserEvents(events, root);
  const failure = new Error("root listener failed");
  const add = jest.spyOn(root, "addEventListener").mockImplementationOnce(() => {
    throw failure;
  });
  const removeWindow = jest.spyOn(window, "removeEventListener");
  expect(() => events.register({ id: "click", type: "click", handle: () => {} })).toThrow(failure);
  expect(removeWindow).toHaveBeenCalledWith("click", expect.any(Function), true);
  add.mockRestore();
  const handle = jest.fn();
  const release = events.register({ id: "click", type: "click", handle });
  root.click();
  expect(handle).toHaveBeenCalledTimes(1);
  release();
  removeWindow.mockRestore();
  detach();
});

it("releases remaining listeners when a boundary removal fails", () => {
  const root = document.createElement("div");
  const events = new BrowserEvents();
  const detach = attachTestBrowserEvents(events, root);
  const release = events.register({ id: "click", type: "click", handle: () => {} });
  const failure = new Error("window removal failed");
  const removeWindow = jest.spyOn(window, "removeEventListener").mockImplementationOnce(() => {
    throw failure;
  });
  const removeRoot = jest.spyOn(root, "removeEventListener");
  expect(release).toThrow(AggregateError);
  expect(removeRoot).toHaveBeenCalledTimes(2);
  removeWindow.mockRestore();
  removeRoot.mockRestore();
  const handle = jest.fn();
  const retry = events.register({ id: "click", type: "click", handle });
  root.click();
  expect(handle).toHaveBeenCalledTimes(1);
  retry();
  detach();
});

it("keeps the snapshot when the final group is replaced during window capture", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const events = new BrowserEvents();
  const calls: string[] = [];
  let release = () => {};
  release = events.register({
    id: "window",
    type: "click",
    target: "window",
    capture: true,
    handle: () => {
      calls.push("window");
      release();
      events.register({
        id: "root",
        type: "click",
        handle: () => {
          calls.push("root");
        },
      });
    },
  });
  const detach = attachTestBrowserEvents(events, root);
  root.click();
  expect(calls).toEqual(["window"]);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  root.click();
  expect(calls).toEqual(["window", "root"]);
  detach();
  root.remove();
});

it("preserves both snapshots when a nested event replaces the final group", () => {
  const root = document.createElement("div");
  root.innerHTML = '<button data-marker="outer"></button><button data-marker="inner"></button>';
  document.body.append(root);
  const [outer, inner] = root.querySelectorAll("button");
  const events = new BrowserEvents();
  const calls: string[] = [];
  let release = () => {};
  release = events.register({
    id: "window",
    type: "click",
    target: "window",
    capture: true,
    handle: (input) => {
      const marker = input.target?.ancestorAttribute("[data-marker]", "data-marker");
      calls.push(marker ?? "unknown");
      if (marker === "outer") {
        inner.click();
      } else {
        release();
        events.register({
          id: "root",
          type: "click",
          handle: () => {
            calls.push("root");
          },
        });
      }
    },
  });
  const detach = attachTestBrowserEvents(events, root);
  outer.click();
  expect(calls).toEqual(["outer", "inner"]);
  root.click();
  expect(calls).toEqual(["outer", "inner", "root"]);
  detach();
  root.remove();
});
