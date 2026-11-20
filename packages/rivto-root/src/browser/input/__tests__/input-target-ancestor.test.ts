import { BrowserInputListeners } from "../browser-input-listeners";

it("checks the closest matching ancestor without exposing it", () => {
  const root = document.createElement("div");
  root.innerHTML = "<div data-control><div data-control data-anchor><span></span></div></div>";
  const listeners = new BrowserInputListeners();
  const values: Array<boolean | undefined> = [];
  listeners.register({ type: "click", target: "root", capture: false }, (input) => {
    values.push(input.target?.closestAncestorMatches("[data-control]", "[data-anchor]"));
  });
  const detach = listeners.attach(root);
  root.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  root.querySelector("[data-control]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(values).toEqual([true, false, undefined]);
  detach();
});
