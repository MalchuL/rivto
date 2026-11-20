import { NativeEventListeners } from "../native-event-listeners";

it("preserves registrations across remounts and ignores stale detach", () => {
  const events = new NativeEventListeners();
  const root = document.createElement("div");
  const calls: Event[] = [];
  const remove = events.register({ type: "click", target: "root", capture: false }, (event) => {
    calls.push(event);
  });
  const detach = events.attach(root);
  root.click();
  detach();
  const detachAgain = events.attach(root);
  detach();
  root.click();
  expect(calls).toHaveLength(2);
  remove();
  root.click();
  expect(calls).toHaveLength(2);
  detachAgain();
});

it("releases every listener and disables callbacks when native removal throws", () => {
  const events = new NativeEventListeners();
  const root = document.createElement("div");
  const deliver = jest.fn();
  events.register({ type: "click", target: "root", capture: false }, deliver);
  events.register({ type: "input", target: "root", capture: false }, deliver);
  const detach = events.attach(root);
  const nativeRemove = root.removeEventListener.bind(root);
  const spy = jest
    .spyOn(root, "removeEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "click") {
        throw new Error("remove failed");
      }
      nativeRemove(type, listener, options);
    });
  expect(detach).toThrow(AggregateError);
  expect(spy.mock.calls.map(([type]) => type)).toEqual(["click", "input"]);
  root.click();
  root.dispatchEvent(new Event("input"));
  expect(deliver).not.toHaveBeenCalled();
  expect(detach).not.toThrow();
  spy.mockRestore();
});

it("preserves setup and rollback errors and allows a later attachment", () => {
  const events = new NativeEventListeners();
  const root = document.createElement("div");
  const setupFailure = new Error("setup");
  const cleanupFailure = new Error("cleanup");
  events.register({ type: "click", target: "root", capture: false }, () => {});
  events.register({ type: "input", target: "root", capture: false }, () => {});
  const add = root.addEventListener.bind(root);
  const addSpy = jest
    .spyOn(root, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "input") {
        throw setupFailure;
      }
      add(type, listener, options);
    });
  const removeSpy = jest.spyOn(root, "removeEventListener").mockImplementation(() => {
    throw cleanupFailure;
  });
  let failure: unknown;
  try {
    events.attach(root);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([
    setupFailure,
    expect.objectContaining({ errors: [cleanupFailure] }),
  ]);
  addSpy.mockRestore();
  removeSpy.mockRestore();
  const detach = events.attach(root);
  detach();
});

it("does not deliver a removed listener retained by a failing native target", () => {
  const events = new NativeEventListeners();
  const root = document.createElement("div");
  const deliver = jest.fn();
  const remove = events.register({ type: "click", target: "root", capture: false }, deliver);
  const detach = events.attach(root);
  const spy = jest.spyOn(root, "removeEventListener").mockImplementation(() => {
    throw new Error("remove");
  });
  expect(remove).toThrow("remove");
  root.click();
  expect(deliver).not.toHaveBeenCalled();
  spy.mockRestore();
  detach();
});

it("falls back to the document for window registrations when the root has no window", () => {
  const events = new NativeEventListeners();
  const detachedDocument = document.implementation.createHTMLDocument();
  const root = detachedDocument.createElement("div");
  const deliver = jest.fn();
  events.register({ type: "click", target: "window", capture: false }, deliver);
  const detach = events.attach(root);
  detachedDocument.dispatchEvent(new Event("click"));
  expect(deliver).toHaveBeenCalledTimes(1);
  detach();
});

it("prevents reentrant detach from releasing any listener twice", () => {
  const events = new NativeEventListeners();
  const root = document.createElement("div");
  events.register({ type: "click", target: "root", capture: false }, () => {});
  events.register({ type: "input", target: "root", capture: false }, () => {});
  const detach = events.attach(root);
  const nativeRemove = root.removeEventListener.bind(root);
  const spy = jest
    .spyOn(root, "removeEventListener")
    .mockImplementation((type, listener, options) => {
      detach();
      nativeRemove(type, listener, options);
    });
  detach();
  expect(spy.mock.calls.map(([type]) => type)).toEqual(["click", "input"]);
  spy.mockRestore();
});

it("reports all native removal failures after attempting each listener", () => {
  const events = new NativeEventListeners();
  const root = document.createElement("div");
  events.register({ type: "click", target: "root", capture: false }, () => {});
  events.register({ type: "input", target: "root", capture: false }, () => {});
  const detach = events.attach(root);
  const clickFailure = new Error("click removal");
  const inputFailure = new Error("input removal");
  const spy = jest.spyOn(root, "removeEventListener").mockImplementation((type) => {
    throw type === "click" ? clickFailure : inputFailure;
  });
  let failure: unknown;
  try {
    detach();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([clickFailure, inputFailure]);
  expect(spy).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});
