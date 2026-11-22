import type { RegionIdentity } from "../../../events/types";
import { BrowserInputListeners } from "../browser-input-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("shares opaque element identities across captures without reviving detached roots", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML = "<button>target</button>";
  const first = new BrowserInputRoot(root);
  const replacement = new BrowserInputRoot(root);
  const listeners = new BrowserInputListeners();
  let targetIdentity: RegionIdentity | undefined;
  listeners.register({ type: "click", target: "root", capture: false }, (input) => {
    targetIdentity = input.target?.getNearestAncestorIdentity?.("[data-panel]");
  });
  const detach = listeners.attach(root);
  root.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(targetIdentity).toBe(first.getElementIdentity());
  first.detach();
  expect(first.isAttached()).toBe(false);
  expect(replacement.isAttached()).toBe(true);
  expect(replacement.getElementIdentity()).toBe(targetIdentity);
  detach();
  replacement.detach();
});
