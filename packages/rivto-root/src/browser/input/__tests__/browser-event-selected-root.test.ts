import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("normalizes shared document input against the occurrence chosen by the consumer", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  const input = document.createElement("input");
  second.append(input);
  document.body.append(first, second);
  const occurrence = new BrowserInputRoot(second);
  const seen: boolean[] = [];
  const listeners = new BrowserEventListeners((_group, _root, capture) => {
    const normalized = capture(occurrence);
    seen.push(normalized?.target?.belongsToRoot() ?? false);
  }, []);
  listeners.connect(
    [{ target: "document", type: "keydown", capture: false, passive: false }],
    testInputRoots(new Set([first, second])),
  );
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "x" }));
  expect(seen).toEqual([true]);
  listeners.disconnect();
  occurrence.detach();
  first.remove();
  second.remove();
});
