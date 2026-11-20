import { attachTestBrowserEvents } from "../../../test-utils/attach-test-browser-events";
import { BrowserEvents } from "../browser-events";

it("delivers observers even when an earlier-priority handler claims the input", () => {
  const events = new BrowserEvents();
  const root = document.createElement("div");
  const calls: string[] = [];
  events.register({
    id: "claim",
    type: "click",
    priority: 100,
    handle: () => {
      calls.push("handler");
      return "handled";
    },
  });
  events.observe({ id: "observer", type: "click", priority: -1 }, () => {
    calls.push("observer");
  });
  const detach = attachTestBrowserEvents(events, root);
  root.click();
  expect(calls).toEqual(["observer", "handler"]);
  detach();
});
