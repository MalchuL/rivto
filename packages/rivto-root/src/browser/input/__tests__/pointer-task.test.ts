import type { PointerInput } from "../../../events/types";
import { BrowserInputListeners } from "../browser-input-listeners";

it("cancels pointer tasks and suppresses them after the same root is reattached", () => {
  jest.useFakeTimers();
  const root = document.createElement("div");
  const listeners = new BrowserInputListeners();
  const run = jest.fn();
  let input: PointerInput<"pointerdown"> | undefined;
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (event) => {
    input = event;
  });
  try {
    const detach = listeners.attach(root);
    root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    const cancel = input!.scheduleTask(run);
    cancel();
    cancel();
    input!.scheduleTask(run);
    detach();
    const detachAgain = listeners.attach(root);
    root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    input!.scheduleTask(run);
    jest.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
    detachAgain();
    input!.scheduleTask(run);
    jest.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
