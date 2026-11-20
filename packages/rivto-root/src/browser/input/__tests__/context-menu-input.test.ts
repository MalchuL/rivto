import { BrowserInputListeners } from "../browser-input-listeners";

it("normalizes context menu input and can prevent its browser default", () => {
  const root = document.createElement("div");
  root.innerHTML = '<div data-control="true"></div>';
  const target = root.firstElementChild!;
  const listeners = new BrowserInputListeners();
  const received = jest.fn();
  listeners.register({ type: "contextmenu", target: "root", capture: false }, (input) => {
    received(input.button, input.target?.hasAncestor("[data-control]"));
    expect(input).not.toHaveProperty("raw");
    input.preventDefault();
  });
  const detach = listeners.attach(root);
  const native = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  target.dispatchEvent(native);
  expect(received).toHaveBeenCalledWith(2, true);
  expect(native.defaultPrevented).toBe(true);
  detach();
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
  expect(received).toHaveBeenCalledTimes(1);
});
