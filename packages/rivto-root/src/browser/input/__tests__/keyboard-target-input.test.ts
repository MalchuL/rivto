import { BrowserInputListeners } from "../browser-input-listeners";

it("provides live keyboard target queries with normalized input", () => {
  const root = document.createElement("div");
  root.innerHTML = '<div data-owner="one"><input></div>';
  const owner = root.firstElementChild!;
  const input = root.querySelector("input")!;
  const listeners = new BrowserInputListeners();
  const seen: Array<string | undefined> = [];
  listeners.register({ type: "keydown", target: "root", capture: false }, (event) => {
    expect(event.keyboardTarget?.read()?.isFormControl).toBe(true);
    seen.push(
      event.keyboardTarget?.closestAncestorAttribute("input", "[data-owner]", "data-owner"),
    );
    owner.setAttribute("data-owner", "two");
    seen.push(
      event.keyboardTarget?.closestAncestorAttribute("input", "[data-owner]", "data-owner"),
    );
    expect(event).not.toHaveProperty("raw");
  });
  const detach = listeners.attach(root);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
  expect(seen).toEqual(["one", "two"]);
  detach();
});
