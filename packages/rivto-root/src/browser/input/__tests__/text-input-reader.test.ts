import { BrowserInputListeners } from "../browser-input-listeners";

it("reads live text from the content host captured for beforeinput", () => {
  const root = document.createElement("div");
  root.innerHTML = "<div data-content>before<span></span></div>";
  const content = root.querySelector("[data-content]")!;
  const target = content.querySelector("span")!;
  const listeners = new BrowserInputListeners();
  let read: (() => string) | undefined;
  listeners.register({ type: "beforeinput", target: "root", capture: false }, (input) => {
    read = input.captureTargetText("[data-content]");
    expect(input.captureTargetText("[data-missing]")).toBeUndefined();
  });
  const detach = listeners.attach(root);
  target.dispatchEvent(new InputEvent("beforeinput", { bubbles: true }));
  expect(read?.()).toBe("before");
  content.remove();
  content.textContent = "after";
  expect(read?.()).toBe("after");
  detach();
});
