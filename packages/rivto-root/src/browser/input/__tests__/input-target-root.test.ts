import { BrowserInputListeners } from "../browser-input-listeners";

it("distinguishes the root from its direct text target", () => {
  const root = document.createElement("div");
  root.textContent = "text";
  const listeners = new BrowserInputListeners();
  const received = jest.fn();
  listeners.register({ type: "click", target: "root", capture: false }, (event) => {
    received(event.target?.isRoot());
  });
  const detach = listeners.attach(root);
  root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  root.firstChild!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(received.mock.calls).toEqual([[true], [false]]);
  detach();
});
