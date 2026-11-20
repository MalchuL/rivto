import { BrowserInputListeners } from "../browser-input-listeners";

it("compares closest matching ancestors without conflating nested matches", () => {
  const root = document.createElement("div");
  root.innerHTML = "<div data-anchor data-control><div data-anchor><span>Text</span></div></div>";
  const outer = root.firstElementChild!;
  const inner = outer.firstElementChild!;
  const target = inner.firstElementChild!;
  const listeners = new BrowserInputListeners();
  const received = jest.fn();
  listeners.register({ type: "click", target: "root", capture: false }, (input) => {
    received(input.target?.closestAncestorsAreSame("[data-control]", "[data-anchor]"));
  });
  const detach = listeners.attach(root);
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  inner.setAttribute("data-control", "");
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  inner.removeAttribute("data-control");
  outer.removeAttribute("data-control");
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(received.mock.calls).toEqual([[false], [true], [false]]);
  detach();
});
