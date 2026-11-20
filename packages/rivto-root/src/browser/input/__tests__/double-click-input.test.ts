import { BrowserInputListeners } from "../browser-input-listeners";

it("delivers double-click coordinates and target capabilities without native objects", () => {
  const root = document.createElement("div");
  root.innerHTML = '<div data-control="true"></div>';
  const target = root.firstElementChild!;
  const listeners = new BrowserInputListeners();
  const received = jest.fn();
  listeners.register({ type: "dblclick", target: "root", capture: false }, (event) => {
    received(
      event.clientX,
      event.clientY,
      event.button,
      event.target?.hasAncestor("[data-control]"),
    );
    expect(event).not.toHaveProperty("raw");
  });
  const detach = listeners.attach(root);
  target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 12, clientY: 23 }));
  expect(received).toHaveBeenCalledWith(12, 23, 0, true);
  detach();
  target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(received).toHaveBeenCalledTimes(1);
});
