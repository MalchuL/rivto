import type { InputEvent, InputTarget } from "@chulane/rivto-root";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockInputEventValue } from "../block-input-event";

it("uses the normalized occurrence boundary when resolving Page input ownership", () => {
  const root = document.createElement("div");
  const child = document.createElement("span");
  root.append(child);
  const belongsToRoot = jest.fn(() => false);
  const target: InputTarget = {
    captureTargetHit: () => undefined,
    captureUncapturedPointerHit: () => undefined,
    isRoot: () => false,
    belongsToRoot,
    hasAncestor: () => false,
    closestAncestorMatches: () => undefined,
    closestAncestorsAreSame: () => false,
    closestAncestorIsEditable: () => undefined,
    ancestorAttribute: () => undefined,
    ancestorAttributeWithinRoot: () => undefined,
    hasAncestorWithinOwner: () => false,
  };
  const input: InputEvent = {
    type: "selectionchange",
    target,
    preventDefault: () => {},
    stopPropagation: () => {},
  };
  const occurrence = new BrowserInputRoot(root);
  const received = jest.fn();
  root.addEventListener("selectionchange", () => {
    received(new BlockInputEventValue("root", input, occurrence, {}));
  });
  child.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  expect(belongsToRoot).toHaveBeenCalledWith("[data-rivto-block-editor]");
  expect(received).toHaveBeenCalledWith(
    expect.objectContaining({ insideRoot: false, blockId: null }),
  );
  occurrence.detach();
});
