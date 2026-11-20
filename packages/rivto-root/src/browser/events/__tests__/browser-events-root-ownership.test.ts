import { BrowserInputRoot } from "../../input/browser-input-root";
import { BrowserEvents } from "../browser-events";

it("keeps a replacement attachment created during a Root ownership check", () => {
  const firstElement = document.createElement("div");
  const secondElement = document.createElement("div");
  document.body.append(firstElement, secondElement);
  const events = new BrowserEvents();
  const second = new BrowserInputRoot(secondElement);
  let stopSecond: (() => void) | undefined;
  let triggered = false;
  const first = new BrowserInputRoot(firstElement, () => {
    if (!triggered) {
      triggered = true;
      stopSecond = events.attach(second);
    }
    return true;
  });
  const handler = jest.fn();
  events.register({ id: "click", type: "click", handle: handler });
  try {
    expect(() => events.attach(first)).toThrow("unattached root");
    secondElement.click();
    expect(handler).toHaveBeenCalledTimes(1);
  } finally {
    stopSecond?.();
    first.detach();
    second.detach();
    firstElement.remove();
    secondElement.remove();
  }
});

it("borrows the Root and stops delivering when the owner detaches it", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const events = new BrowserEvents();
  const handler = jest.fn();
  events.register({ id: "click", type: "click", handle: handler });
  let detach = events.attach(root);
  try {
    element.click();
    expect(handler).toHaveBeenCalledTimes(1);
    detach();
    expect(root.isAttached()).toBe(true);
    detach = events.attach(root);
    root.detach();
    element.click();
    expect(handler).toHaveBeenCalledTimes(1);
  } finally {
    detach();
    root.detach();
    element.remove();
  }
});

it("keeps a same-element replacement when stale cleanup runs later", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const firstRoot = new BrowserInputRoot(element);
  const firstEvents = new BrowserEvents();
  const firstHandler = jest.fn();
  firstEvents.register({ id: "first", type: "click", handle: firstHandler });
  const stopFirst = firstEvents.attach(firstRoot);
  firstRoot.detach();
  const secondRoot = new BrowserInputRoot(element);
  const secondEvents = new BrowserEvents();
  const secondHandler = jest.fn();
  secondEvents.register({ id: "second", type: "click", handle: secondHandler });
  const stopSecond = secondEvents.attach(secondRoot);
  try {
    element.click();
    stopFirst();
    element.click();
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(2);
  } finally {
    stopFirst();
    stopSecond();
    firstRoot.detach();
    secondRoot.detach();
    element.remove();
  }
});
