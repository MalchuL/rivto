import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("retains the originating owner across shared window delivery and releases it safely", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(first, second);
  const firstRoot = new BrowserInputRoot(first);
  const secondRoot = new BrowserInputRoot(second);
  const seen: Array<object | undefined> = [];
  const createListeners = (root: BrowserInputRoot) =>
    new BrowserEventListeners((group, _element, _capture, _identity, control) => {
      if (group.type === "pointerdown") {
        control.claimPointerOwner(root.getElementIdentity());
      } else {
        seen.push(control.getPointerOwner());
        control.releasePointerOwner();
      }
    }, []);
  const firstListeners = createListeners(firstRoot);
  const secondListeners = createListeners(secondRoot);
  const groups = [
    { type: "pointerdown", target: "surface", capture: false, passive: false },
    { type: "pointerup", target: "window", capture: false, passive: false },
  ] as const;
  try {
    firstListeners.connect(groups, testInputRoots(new Set([first])));
    secondListeners.connect(groups, testInputRoots(new Set([second])));
    first.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    second.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(firstRoot.getElementIdentity());
    expect(seen[1]).toBe(firstRoot.getElementIdentity());
    first.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    secondRoot.releasePointerOwnership();
    seen.length = 0;
    second.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(firstRoot.getElementIdentity());
    expect(seen[1]).toBe(firstRoot.getElementIdentity());
  } finally {
    firstRoot.releasePointerOwnership();
    firstListeners.disconnect();
    secondListeners.disconnect();
    firstRoot.detach();
    secondRoot.detach();
    first.remove();
    second.remove();
  }
});
