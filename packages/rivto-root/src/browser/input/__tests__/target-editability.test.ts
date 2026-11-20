import { BrowserInputListeners } from "../browser-input-listeners";

it("reads closest ancestor editability live within the attached occurrence", () => {
  const root = document.createElement("div");
  root.innerHTML = "<div data-anchor><span>Text</span></div>";
  const anchor = root.querySelector<HTMLElement>("[data-anchor]")!;
  const target = anchor.querySelector("span")!;
  let editable = false;
  Object.defineProperty(anchor, "isContentEditable", { configurable: true, get: () => editable });
  const listeners = new BrowserInputListeners();
  const received = jest.fn();
  listeners.register({ type: "click", target: "root", capture: false }, (input) => {
    received(input.target?.closestAncestorIsEditable("[data-anchor]"));
  });
  const detach = listeners.attach(root);
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  editable = true;
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  target.firstChild!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  anchor.removeAttribute("data-anchor");
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(received.mock.calls).toEqual([[false], [true], [undefined], [undefined]]);
  detach();
});

it("does not expose an ancestor outside the occurrence", () => {
  const outer = document.createElement("div");
  outer.dataset.anchor = "";
  const root = document.createElement("div");
  outer.append(root);
  const listeners = new BrowserInputListeners();
  const received = jest.fn();
  listeners.register({ type: "click", target: "root", capture: false }, (input) => {
    received(input.target?.closestAncestorIsEditable("[data-anchor]"));
  });
  const detach = listeners.attach(root);
  root.click();
  expect(received).toHaveBeenCalledWith(undefined);
  detach();
});
