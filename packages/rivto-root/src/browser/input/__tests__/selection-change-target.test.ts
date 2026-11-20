import { BrowserInputListeners } from "../browser-input-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("captures the selection anchor as an opaque target for panel routing", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML = "<div data-panel><span>text</span></div>";
  document.body.append(root);
  const nested = root.querySelector<HTMLElement>("[data-panel]")!;
  const text = nested.querySelector("span")!.firstChild!;
  const nestedRoot = new BrowserInputRoot(nested);
  const selection = document.getSelection()!;
  const range = document.createRange();
  range.setStart(text, 1);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  const values: Array<boolean | undefined> = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "selectionchange", target: "document", capture: false }, (input) => {
    values.push(input.selectionTarget?.isNearestAncestorRoot?.("[data-panel]", nestedRoot));
  });
  const detach = listeners.attach(root);
  document.dispatchEvent(new Event("selectionchange"));
  selection.removeAllRanges();
  document.dispatchEvent(new Event("selectionchange"));
  expect(values).toEqual([true, undefined]);
  detach();
  nestedRoot.detach();
  root.remove();
});
