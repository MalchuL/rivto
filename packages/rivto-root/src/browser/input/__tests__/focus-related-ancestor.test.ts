import { BrowserInputListeners } from "../browser-input-listeners";

it("retains the selected ancestor while checking the current related focus target", () => {
  const root = document.createElement("div");
  root.innerHTML = "<div data-block><button></button><span>text</span></div><div data-block></div>";
  const [first, second] = root.querySelectorAll("[data-block]");
  const button = root.querySelector("button")!;
  const text = root.querySelector("span")!.firstChild!;
  let related: EventTarget | null = text;
  const event = new FocusEvent("focusout", { bubbles: true });
  Object.defineProperty(event, "relatedTarget", { get: () => related });
  const values: boolean[] = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "focusout", target: "root", capture: false }, (input) => {
    const within = input.captureRelatedTargetWithinAncestor("[data-block]");
    second.append(button);
    values.push(within());
    related = second;
    values.push(within());
    related = null;
    values.push(within());
  });
  const detach = listeners.attach(root);
  button.dispatchEvent(event);
  expect(first.contains(text)).toBe(true);
  expect(values).toEqual([true, false, false]);
  detach();
});
