import { BrowserInputListeners } from "../browser-input-listeners";

it("distinguishes an element target from a text node in the same ancestry", () => {
  const root = document.createElement("div");
  root.innerHTML = "<span>text</span>";
  const span = root.querySelector("span")!;
  const seen: Array<boolean | undefined> = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "click", target: "root", capture: false }, (input) => {
    seen.push(input.target?.isElement?.());
  });
  const detach = listeners.attach(root);
  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  span.firstChild!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(seen).toEqual([true, false]);
  detach();
});
