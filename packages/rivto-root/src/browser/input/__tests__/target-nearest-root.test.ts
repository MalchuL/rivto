import { BrowserInputListeners } from "../browser-input-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("compares the nearest marked ancestor with opaque occurrence roots", () => {
  const outer = document.createElement("div");
  outer.dataset.panel = "";
  outer.innerHTML = "<div data-panel><button>inner</button></div>";
  const inner = outer.querySelector<HTMLElement>("[data-panel]")!;
  const button = inner.querySelector("button")!;
  const outerRoot = new BrowserInputRoot(outer);
  const innerRoot = new BrowserInputRoot(inner);
  const seen: Array<[boolean | undefined, boolean | undefined]> = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "click", target: "root", capture: false }, (input) => {
    seen.push([
      input.target?.isNearestAncestorRoot?.("[data-panel]", outerRoot),
      input.target?.isNearestAncestorRoot?.("[data-panel]", innerRoot),
    ]);
  });
  const detach = listeners.attach(outer);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const comment = document.createComment("target");
  inner.append(comment);
  comment.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  innerRoot.detach();
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(seen).toEqual([
    [false, true],
    [false, true],
    [false, false],
  ]);
  detach();
  outerRoot.detach();
  innerRoot.detach();
});
