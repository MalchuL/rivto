import { attachTestBrowserEvents } from "../../../test-utils/attach-test-browser-events";
import { BrowserEvents } from "../browser-events";

it("keeps passive and active claims separate while sharing the registration snapshot", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const events = new BrowserEvents();
  const calls: string[] = [];
  events.register({
    id: "passive",
    type: "wheel",
    passive: true,
    handle: (input) => {
      calls.push("passive");
      input.preventDefault();
      if (calls.length === 1) {
        events.register({ id: "late", type: "wheel", handle: () => void calls.push("late") });
      }
      return "handled";
    },
  });
  events.register({
    id: "active",
    type: "wheel",
    handle: (input) => {
      calls.push("active");
      input.preventDefault();
    },
  });
  const detach = attachTestBrowserEvents(events, root);
  try {
    const first = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    root.dispatchEvent(first);
    expect(calls).toEqual(["passive", "active"]);
    expect(first.defaultPrevented).toBe(true);
    root.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true }));
    expect(calls).toEqual(["passive", "active", "passive", "active", "late"]);
  } finally {
    detach();
    root.remove();
  }
});
