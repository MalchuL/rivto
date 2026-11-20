import { BrowserInputListeners } from "../browser-input-listeners";

it("limits ancestor attributes and region ownership to the receiving root", () => {
  const outer = document.createElement("div");
  outer.dataset.owner = "outer";
  const root = document.createElement("div");
  outer.append(root);
  root.innerHTML = '<div data-region><div data-owner="inner"><span>text</span></div></div>';
  const listeners = new BrowserInputListeners();
  const seen = jest.fn();
  listeners.register({ type: "click", target: "root", capture: false }, (event) => {
    seen(
      event.target?.ancestorAttributeWithinRoot("[data-owner]", "data-owner"),
      event.target?.hasAncestorWithinOwner("[data-region]", "[data-owner]"),
    );
  });
  const detach = listeners.attach(root);
  const text = root.querySelector("span")!.firstChild!;
  text.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(seen).toHaveBeenLastCalledWith("inner", false);
  root.querySelector("[data-owner]")!.removeAttribute("data-owner");
  text.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(seen).toHaveBeenLastCalledWith(undefined, false);
  root.querySelector("[data-region]")!.setAttribute("data-owner", "local");
  text.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(seen).toHaveBeenLastCalledWith("local", true);
  detach();
});
