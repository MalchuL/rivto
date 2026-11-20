import { BrowserInputRoot } from "../browser-input-root";
import type { InputObserverDefinition } from "../../../events/types";

it("does not expose occurrence filtering as an observer option", () => {
  const definition: InputObserverDefinition<"click"> = {
    type: "click",
    target: "root",
    capture: false,
    // @ts-expect-error Root observations include nested input and do not filter it here.
    includeNested: false,
  };
  expect(definition.type).toBe("click");
});

it("shares one dispatch identity across phases and releases every observer", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const observer = root.createInputObserver()!;
  const seen: (object | undefined)[] = [];
  const capture = observer.observe({ type: "click", target: "root", capture: true }, (_, id) => {
    seen.push(id);
  });
  observer.observe({ type: "click", target: "root", capture: false }, (_, id) => {
    seen.push(id);
  });
  const event = new MouseEvent("click", { bubbles: true });
  try {
    element.dispatchEvent(event);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeDefined();
    expect(seen[0]).toBe(seen[1]);
    element.dispatchEvent(event);
    expect(seen[2]).toBe(seen[3]);
    expect(seen[2]).not.toBe(seen[0]);
    observer.dispose();
    capture();
    element.dispatchEvent(event);
    expect(seen).toHaveLength(4);
    expect(() =>
      observer.observe({ type: "click", target: "root", capture: false }, () => {}),
    ).toThrow("Input observer is disposed");
  } finally {
    observer.dispose();
    root.detach();
    element.remove();
  }
});

it("attempts every input cleanup even when a listener removal fails", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const observer = root.createInputObserver()!;
  observer.observe({ type: "click", target: "root", capture: false }, () => {});
  observer.observe({ type: "keydown", target: "root", capture: false }, () => {});
  const original = element.removeEventListener.bind(element);
  const remove = jest
    .spyOn(element, "removeEventListener")
    .mockImplementation((type, listener, options) => {
      original(type, listener, options);
      if (type === "click") {
        throw new Error("click cleanup failed");
      }
    });
  try {
    expect(() => observer.dispose()).toThrow();
    expect(remove.mock.calls.some(([type]) => type === "keydown")).toBe(true);
    observer.dispose();
  } finally {
    remove.mockRestore();
    root.detach();
  }
});

it("stops delivery when the borrowed Root detaches before observer cleanup", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const observer = root.createInputObserver()!;
  const deliver = jest.fn();
  observer.observe({ type: "click", target: "root", capture: false }, deliver);
  element.click();
  expect(deliver).toHaveBeenCalledTimes(1);
  root.detach();
  element.click();
  expect(deliver).toHaveBeenCalledTimes(1);
  observer.dispose();
  expect(root.createInputObserver()).toBeUndefined();
});
