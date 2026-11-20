import { BrowserInputListeners } from "../browser-input-listeners";

it("queries focused text controls live when clipboard input targets the surface", () => {
  const root = document.createElement("div");
  const control = document.createElement("input");
  control.dataset.control = "";
  root.append(control);
  document.body.append(root);
  const listeners = new BrowserInputListeners();
  const results: boolean[] = [];
  listeners.register({ type: "paste", target: "root", capture: false }, (event) => {
    results.push(event.clipboardTarget.isIndependentTextEditing("[data-control]", "[data-block]"));
    control.blur();
    results.push(event.clipboardTarget.isIndependentTextEditing("[data-control]", "[data-block]"));
  });
  const detach = listeners.attach(root);
  try {
    control.focus();
    root.dispatchEvent(new Event("paste", { bubbles: true }));
    expect(results).toEqual([true, false]);
  } finally {
    detach();
    root.remove();
  }
});
