import { attachTestBrowserEvents } from "../../../test-utils/attach-test-browser-events";
import { BrowserEvents } from "../browser-events";

it("observes nested input without letting the outer handler claim it", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  outer.append(inner);
  const outerEvents = new BrowserEvents();
  const innerEvents = new BrowserEvents();
  const outerHandler = jest.fn();
  const observer = jest.fn();
  const innerHandler = jest.fn(() => "handled" as const);
  outerEvents.register({ id: "outer", type: "click", handle: outerHandler });
  const stopObserving = outerEvents.observe(
    { id: "nested-observer", type: "click", includeNested: true },
    observer,
  );
  innerEvents.register({ id: "inner", type: "click", handle: innerHandler });
  const detachOuter = attachTestBrowserEvents(outerEvents, outer);
  const detachInner = attachTestBrowserEvents(innerEvents, inner);
  inner.click();
  expect(innerHandler).toHaveBeenCalledTimes(1);
  expect(observer).toHaveBeenCalledTimes(1);
  expect(outerHandler).not.toHaveBeenCalled();
  stopObserving();
  inner.click();
  expect(observer).toHaveBeenCalledTimes(1);
  detachInner();
  outer.click();
  expect(outerHandler).toHaveBeenCalledTimes(1);
  detachOuter();
});
